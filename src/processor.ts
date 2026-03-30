import { dirname, extname, basename, resolve } from "node:path";
import { markdownToHtml, wrapInHtmlDocument, parseFrontmatter, generateToc, highlightCodeBlocks, applyTemplate } from "./markdown.ts";
import { embedResources, type EmbedOptions } from "./embedder.ts";

export interface ProcessFileOptions {
  template?: string | null;
  toc?: boolean;
  verbose?: boolean;
  maxSize?: number | null;
}

/**
 * Rewrites local .md links in HTML to .html so inter-page navigation
 * works after conversion. Remote URLs and non-.md links are left untouched.
 */
export function rewriteLocalMdLinks(html: string): string {
  // Match href="...something.md" or href="...something.md#anchor"
  // Only rewrite local relative links, not remote URLs.
  return html.replace(
    /(<a\s[^>]*href=["'])([^"']*\.md)(#[^"']*)?(?=["'])/gi,
    (match, prefix: string, mdPath: string, anchor: string | undefined) => {
      // Skip remote URLs
      if (mdPath.startsWith("http://") || mdPath.startsWith("https://") || mdPath.startsWith("//")) {
        return match;
      }
      const htmlPath = mdPath.replace(/\.md$/i, ".html");
      return `${prefix}${htmlPath}${anchor ?? ""}`;
    }
  );
}

/**
 * Extracts head-level HTML elements (<link>, <style>) from markdown content.
 * These elements are removed from the markdown so they aren't lost if the
 * markdown renderer strips them, and returned separately for injection
 * into <head>. Elements inside fenced code blocks are left untouched.
 */
export function extractHeadElements(markdown: string): { content: string; headElements: string } {
  const headElements: string[] = [];
  const lines = markdown.split('\n');
  const resultLines: string[] = [];
  let inCodeBlock = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const stripped = line.trim();

    // Track fenced code blocks (``` or ~~~)
    if (/^(`{3,}|~{3,})/.test(stripped)) {
      inCodeBlock = !inCodeBlock;
      resultLines.push(line);
      i++;
      continue;
    }

    if (inCodeBlock) {
      resultLines.push(line);
      i++;
      continue;
    }

    // Extract <link ...> tags (void/self-closing head elements)
    if (/^<link\b[^>]*>\s*$/i.test(stripped)) {
      headElements.push(stripped);
      i++;
      continue;
    }

    // Extract <style>...</style> blocks (possibly multi-line)
    if (/^<style[\s>]/i.test(stripped)) {
      let block = line;
      let j = i + 1;
      while (j < lines.length && !block.includes('</style>')) {
        block += '\n' + lines[j]!;
        j++;
      }
      if (block.includes('</style>')) {
        headElements.push(block.trim());
        i = j;
        continue;
      }
      // Malformed style block — leave it in the content
    }

    resultLines.push(line);
    i++;
  }

  return {
    content: resultLines.join('\n'),
    headElements: headElements.join('\n'),
  };
}

/**
 * Processes a single file (Markdown or HTML) and returns the fully
 * portable HTML output with all resources embedded.
 */
export async function processFile(filePath: string, opts?: ProcessFileOptions): Promise<string> {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`File not found: ${filePath}`);
  }

  let content = await file.text();
  const ext = extname(filePath).toLowerCase();
  const baseDir = dirname(filePath);

  let html: string;
  let metadata: Record<string, string> = {};

  if (ext === ".md") {
    // Parse frontmatter
    const fm = parseFrontmatter(content);
    content = fm.content;
    metadata = fm.metadata;

    // Extract head-level HTML elements before markdown conversion
    const extracted = extractHeadElements(content);
    content = extracted.content;
    const headElements = extracted.headElements;

    const bodyHtml = await markdownToHtml(content, baseDir);
    let processedBody = highlightCodeBlocks(bodyHtml);

    const title = metadata["title"] ?? extractTitleFromMarkdown(content) ?? basename(filePath, ext);

    // Generate TOC if requested
    let tocHtml = "";
    if (opts?.toc) {
      tocHtml = generateToc(processedBody);
    }

    if (tocHtml) {
      processedBody = tocHtml + "\n" + processedBody;
    }

    // Apply template or wrap in document
    if (opts?.template) {
      const templatePath = resolve(opts.template);
      const templateFile = Bun.file(templatePath);
      const templateExists = await templateFile.exists();
      if (!templateExists) {
        throw new Error(`Template not found: ${opts.template}`);
      }
      const templateContent = await templateFile.text();
      html = applyTemplate(templateContent, processedBody, title, metadata);
    } else {
      html = wrapInHtmlDocument(processedBody, title, metadata);
    }

    // Inject extracted head elements into <head>
    if (headElements) {
      html = html.replace('</head>', `${headElements}\n</head>`);
    }
  } else if (ext === ".html" || ext === ".htm") {
    html = content;
  } else {
    throw new Error(`Unsupported file type: ${ext}. Only .md and .html files are supported.`);
  }

  // Rewrite local .md links to .html
  html = rewriteLocalMdLinks(html);

  // Embed all local resources into the HTML
  const embedOpts: EmbedOptions = {
    maxSize: opts?.maxSize,
    verbose: opts?.verbose,
  };
  html = await embedResources(html, baseDir, embedOpts);

  return html;
}

/**
 * Extracts the first H1 heading from markdown content for use as a title.
 */
function extractTitleFromMarkdown(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}
