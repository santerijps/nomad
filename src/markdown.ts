import { resolve, dirname, sep } from "node:path";
import type { FrontmatterResult } from "./types.ts";

const EMBED_REGEX = /^\{\{embed:(.+?)\}\}$/gm;
const MAX_EMBED_DEPTH = 10;

/**
 * Pre-processes markdown content by resolving {{embed:path/to/file}} directives.
 * Replaces each directive with the raw text content of the referenced file.
 * Paths are sandboxed to rootDir to prevent path traversal attacks.
 * Recursion is limited to MAX_EMBED_DEPTH levels to prevent infinite loops.
 */
export async function preprocessEmbeds(
  markdown: string,
  baseDir: string,
  rootDir?: string,
  depth: number = 0,
): Promise<string> {
  if (depth >= MAX_EMBED_DEPTH) return markdown;

  const root = rootDir ?? resolve(baseDir);
  const matches = [...markdown.matchAll(EMBED_REGEX)];
  if (matches.length === 0) return markdown;

  let result = markdown;
  for (const match of matches) {
    const filePath = match[1]?.trim();
    if (!filePath) continue;

    const fullPath = resolve(baseDir, filePath);

    // Security: block path traversal outside root directory
    if (!fullPath.startsWith(root + sep)) {
      result = result.replace(match[0], `<!-- nomad: path outside root blocked: ${filePath} -->`);
      continue;
    }

    try {
      const file = Bun.file(fullPath);
      const exists = await file.exists();
      if (exists) {
        let content = await file.text();
        // Recursively process embeds in the included file
        content = await preprocessEmbeds(content, dirname(fullPath), root, depth + 1);
        result = result.replace(match[0], () => content);
      } else {
        result = result.replace(match[0], `<!-- nomad: file not found: ${filePath} -->`);
      }
    } catch {
      result = result.replace(match[0], `<!-- nomad: error reading: ${filePath} -->`);
    }
  }

  return result;
}

/**
 * Converts markdown content to HTML using Bun's built-in Markdown renderer.
 * Processes {{embed:...}} directives before conversion.
 */
export async function markdownToHtml(markdown: string, baseDir: string): Promise<string> {
  const processed = await preprocessEmbeds(markdown, baseDir);

  const bodyHtml = Bun.markdown.html(processed, {
    tables: true,
    strikethrough: true,
    tasklists: true,
    autolinks: true,
    headings: { ids: true },
  });

  return bodyHtml;
}

/**
 * Wraps an HTML body fragment in a complete HTML document.
 * Supports optional metadata from frontmatter for meta tags.
 */
export function wrapInHtmlDocument(
  bodyHtml: string,
  title: string = "Nomad Document",
  metadata?: Record<string, string>,
): string {
  let metaTags = "";
  if (metadata) {
    if (metadata["description"]) {
      metaTags += `\n<meta name="description" content="${escapeHtml(metadata["description"])}">`;
    }
    if (metadata["author"]) {
      metaTags += `\n<meta name="author" content="${escapeHtml(metadata["author"])}">`;
    }
    if (metadata["keywords"]) {
      metaTags += `\n<meta name="keywords" content="${escapeHtml(metadata["keywords"])}">`;
    }
    if (metadata["date"]) {
      metaTags += `\n<meta name="date" content="${escapeHtml(metadata["date"])}">`;
    }
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>${metaTags}
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * Applies a user-provided HTML template.
 * Replaces {{content}}, {{title}}, and any {{key}} from frontmatter metadata.
 */
export function applyTemplate(
  template: string,
  bodyHtml: string,
  title: string,
  metadata?: Record<string, string>,
): string {
  let result = template;
  result = result.replace(/\{\{content\}\}/gi, () => bodyHtml);
  result = result.replace(/\{\{title\}\}/gi, () => escapeHtml(title));
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
      result = result.replace(regex, () => escapeHtml(value));
    }
  }
  // Remove any remaining unreplaced template variables
  result = result.replace(/\{\{[a-zA-Z_]\w*\}\}/g, "");
  return result;
}

/**
 * Parses YAML frontmatter from markdown content.
 * Returns the markdown content without frontmatter and any extracted metadata.
 */
export function parseFrontmatter(markdown: string): FrontmatterResult {
  const match = markdown.match(/^---\r?\n([\s\S]*?)---\r?\n/);
  if (!match) return { content: markdown, metadata: {} };

  const yamlBlock = match[1]!;
  const metadata: Record<string, string> = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) metadata[key] = value;
  }

  const content = markdown.slice(match[0].length);
  return { content, metadata };
}

/**
 * Generates a table of contents HTML nav element from heading tags in the HTML body.
 */
export function generateToc(html: string): string {
  const headingRegex = /<h([2-6])\s[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h[2-6]>/gi;
  const headings: Array<{ level: number; id: string; text: string }> = [];

  for (const match of html.matchAll(headingRegex)) {
    const level = parseInt(match[1]!, 10);
    const id = match[2]!;
    // Strip HTML tags from heading text
    const text = match[3]!.replace(/<[^>]*>/g, "").trim();
    headings.push({ level, id, text });
  }

  if (headings.length === 0) return "";

  let tocHtml = '<nav class="toc">\n<ul>\n';
  let prevLevel = headings[0]!.level;

  for (const h of headings) {
    if (h.level > prevLevel) {
      for (let i = 0; i < h.level - prevLevel; i++) tocHtml += "<ul>\n";
    } else if (h.level < prevLevel) {
      for (let i = 0; i < prevLevel - h.level; i++) tocHtml += "</ul>\n";
    }
    tocHtml += `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>\n`;
    prevLevel = h.level;
  }

  // Close any remaining open lists
  for (let i = 0; i < prevLevel - (headings[0]!.level); i++) tocHtml += "</ul>\n";
  tocHtml += "</ul>\n</nav>";

  return tocHtml;
}

/**
 * Adds syntax highlighting CSS classes to code blocks.
 * Applies inline styles for a default color theme so the output is self-contained.
 */
export function highlightCodeBlocks(html: string): string {
  // Match <pre><code class="language-xxx"> blocks
  return html.replace(
    /(<pre><code class="language-(\w+)">)([\s\S]*?)(<\/code><\/pre>)/gi,
    (_match, openTag: string, lang: string, code: string, closeTag: string) => {
      const highlighted = applySyntaxHighlighting(code, lang);
      return `<pre class="highlight"><code class="language-${lang}">${highlighted}${closeTag}`;
    },
  );
}

function applySyntaxHighlighting(code: string, lang: string): string {
  // Token-based highlighting with inline <span style="..."> for portability
  const S = {
    keyword: 'color:#c678dd',
    string: 'color:#98c379',
    comment: 'color:#5c6370;font-style:italic',
    number: 'color:#d19a66',
    function: 'color:#61afef',
    punctuation: 'color:#abb2bf',
    type: 'color:#e5c07b',
    operator: 'color:#56b6c2',
  };

  // Language-specific keyword sets
  const keywords: Record<string, string[]> = {
    js: ["const","let","var","function","return","if","else","for","while","class","import","export","from","default","new","this","typeof","instanceof","async","await","try","catch","throw","switch","case","break","continue","of","in","yield","null","undefined","true","false"],
    ts: ["const","let","var","function","return","if","else","for","while","class","import","export","from","default","new","this","typeof","instanceof","async","await","try","catch","throw","switch","case","break","continue","of","in","yield","null","undefined","true","false","type","interface","enum","implements","extends","readonly","abstract","declare","namespace","module","as","is","keyof","never","unknown","any","void","string","number","boolean","public","private","protected"],
    py: ["def","class","return","if","elif","else","for","while","import","from","as","try","except","raise","with","in","not","and","or","is","None","True","False","lambda","yield","pass","break","continue","global","nonlocal","async","await","self"],
    python: ["def","class","return","if","elif","else","for","while","import","from","as","try","except","raise","with","in","not","and","or","is","None","True","False","lambda","yield","pass","break","continue","global","nonlocal","async","await","self"],
    javascript: ["const","let","var","function","return","if","else","for","while","class","import","export","from","default","new","this","typeof","instanceof","async","await","try","catch","throw","switch","case","break","continue","of","in","yield","null","undefined","true","false"],
    typescript: ["const","let","var","function","return","if","else","for","while","class","import","export","from","default","new","this","typeof","instanceof","async","await","try","catch","throw","switch","case","break","continue","of","in","yield","null","undefined","true","false","type","interface","enum","implements","extends","readonly","abstract","declare","namespace","module","as","is","keyof","never","unknown","any","void","string","number","boolean","public","private","protected"],
    rust: ["fn","let","mut","const","if","else","for","while","loop","match","return","struct","enum","impl","trait","pub","use","mod","crate","self","super","where","as","in","ref","move","async","await","unsafe","true","false","Some","None","Ok","Err","Self","type","static","extern","dyn"],
    go: ["func","var","const","if","else","for","range","return","struct","interface","type","import","package","defer","go","chan","select","switch","case","break","continue","map","make","new","nil","true","false","string","int","bool","error"],
    sh: ["if","then","else","elif","fi","for","while","do","done","case","esac","function","return","in","echo","exit","export","local","readonly","set","unset","true","false"],
    bash: ["if","then","else","elif","fi","for","while","do","done","case","esac","function","return","in","echo","exit","export","local","readonly","set","unset","true","false"],
    css: ["@import","@media","@keyframes","@font-face","@charset","@supports","!important"],
    html: [],
    json: ["true","false","null"],
    sql: ["SELECT","FROM","WHERE","INSERT","INTO","UPDATE","SET","DELETE","CREATE","TABLE","DROP","ALTER","ADD","JOIN","INNER","LEFT","RIGHT","OUTER","ON","AND","OR","NOT","NULL","AS","ORDER","BY","GROUP","HAVING","LIMIT","DISTINCT","UNION","VALUES","INDEX","PRIMARY","KEY","FOREIGN","REFERENCES","IN","BETWEEN","LIKE","IS","EXISTS","COUNT","SUM","AVG","MIN","MAX","CASE","WHEN","THEN","ELSE","END"],
    c: ["if","else","for","while","do","switch","case","break","continue","return","struct","enum","typedef","union","sizeof","void","int","char","float","double","long","short","unsigned","signed","const","static","extern","register","volatile","auto","NULL","true","false","goto","default","inline","restrict"],
    cpp: ["if","else","for","while","do","switch","case","break","continue","return","struct","enum","typedef","union","sizeof","void","int","char","float","double","long","short","unsigned","signed","const","static","extern","register","volatile","auto","NULL","true","false","goto","default","inline","restrict","class","public","private","protected","virtual","override","template","typename","namespace","using","new","delete","this","try","catch","throw","nullptr","constexpr","auto","decltype","noexcept","final","abstract"],
    java: ["class","public","private","protected","static","final","void","int","long","double","float","boolean","char","byte","short","new","return","if","else","for","while","do","switch","case","break","continue","try","catch","throw","throws","finally","import","package","extends","implements","interface","abstract","synchronized","volatile","transient","native","null","true","false","this","super","instanceof","enum","assert"],
    rb: ["def","class","module","if","elsif","else","unless","for","while","until","do","end","return","yield","begin","rescue","ensure","raise","require","include","extend","attr_accessor","attr_reader","attr_writer","self","nil","true","false","and","or","not","in","then","puts","print","lambda","proc","new","super","case","when"],
    ruby: ["def","class","module","if","elsif","else","unless","for","while","until","do","end","return","yield","begin","rescue","ensure","raise","require","include","extend","attr_accessor","attr_reader","attr_writer","self","nil","true","false","and","or","not","in","then","puts","print","lambda","proc","new","super","case","when"],
  };

  const langKeywords = keywords[lang.toLowerCase()] ?? [];
  const kwSet = new Set(langKeywords);

  // Tokenize and highlight
  // The code is already HTML-escaped from Bun's markdown renderer
  // We work with HTML entities: &amp; &lt; &gt; &quot;
  const tokens: string[] = [];
  let pos = 0;

  while (pos < code.length) {
    // Single-line comment: // or #
    if ((code.startsWith("//", pos) || (lang.match(/^(py|python|rb|ruby|sh|bash)$/) && code[pos] === "#" && (pos === 0 || code[pos - 1] === "\n" || /\s/.test(code[pos - 1]!)))) && !code.startsWith("#!", pos)) {
      const end = code.indexOf("\n", pos);
      const comment = end === -1 ? code.slice(pos) : code.slice(pos, end);
      tokens.push(`<span style="${S.comment}">${comment}</span>`);
      pos += comment.length;
      continue;
    }

    // Multi-line comments /* */
    if (code.startsWith("/*", pos)) {
      const end = code.indexOf("*/", pos + 2);
      const comment = end === -1 ? code.slice(pos) : code.slice(pos, end + 2);
      tokens.push(`<span style="${S.comment}">${comment}</span>`);
      pos += comment.length;
      continue;
    }

    // HTML comment (in code blocks, shown as entities)
    if (code.startsWith("&lt;!--", pos)) {
      const end = code.indexOf("--&gt;", pos);
      const comment = end === -1 ? code.slice(pos) : code.slice(pos, end + 6);
      tokens.push(`<span style="${S.comment}">${comment}</span>`);
      pos += comment.length;
      continue;
    }

    // Strings: &quot;...&quot; or '...' or `...`
    if (code.startsWith("&quot;", pos)) {
      let end = code.indexOf("&quot;", pos + 6);
      const str = end === -1 ? code.slice(pos) : code.slice(pos, end + 6);
      tokens.push(`<span style="${S.string}">${str}</span>`);
      pos += str.length;
      continue;
    }
    if (code[pos] === "'" || code[pos] === "`") {
      const quote = code[pos]!;
      let j = pos + 1;
      while (j < code.length && code[j] !== quote) {
        if (code[j] === "\\") j++; // skip escaped char
        j++;
      }
      const str = code.slice(pos, j + 1);
      tokens.push(`<span style="${S.string}">${str}</span>`);
      pos = j + 1;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(code[pos]!) && (pos === 0 || /[\s(,=+\-*/<>&|!:;\[]/.test(code[pos - 1]!))) {
      let j = pos;
      while (j < code.length && /[0-9a-fA-Fx._]/.test(code[j]!)) j++;
      tokens.push(`<span style="${S.number}">${code.slice(pos, j)}</span>`);
      pos = j;
      continue;
    }

    // Words (identifiers / keywords)
    if (/[a-zA-Z_$@]/.test(code[pos]!)) {
      let j = pos;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j]!)) j++;
      const word = code.slice(pos, j);
      if (kwSet.has(word)) {
        tokens.push(`<span style="${S.keyword}">${word}</span>`);
      } else if (j < code.length && code[j] === "(") {
        tokens.push(`<span style="${S.function}">${word}</span>`);
      } else if (word[0]! >= "A" && word[0]! <= "Z") {
        tokens.push(`<span style="${S.type}">${word}</span>`);
      } else {
        tokens.push(word);
      }
      pos = j;
      continue;
    }

    // Operators
    if (/[+\-*/%=!<>&|^~?:]/.test(code[pos]!) && !code.startsWith("&amp;", pos) && !code.startsWith("&lt;", pos) && !code.startsWith("&gt;", pos)) {
      tokens.push(`<span style="${S.operator}">${code[pos]}</span>`);
      pos++;
      continue;
    }

    // HTML entities that represent operators
    if (code.startsWith("&amp;", pos)) {
      tokens.push(`<span style="${S.operator}">&amp;</span>`);
      pos += 5;
      continue;
    }
    if (code.startsWith("&lt;", pos)) {
      tokens.push(`<span style="${S.operator}">&lt;</span>`);
      pos += 4;
      continue;
    }
    if (code.startsWith("&gt;", pos)) {
      tokens.push(`<span style="${S.operator}">&gt;</span>`);
      pos += 4;
      continue;
    }

    // Everything else (whitespace, punctuation, etc.)
    tokens.push(code[pos]!);
    pos++;
  }

  return tokens.join("");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
