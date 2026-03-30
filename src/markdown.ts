import { resolve, dirname, sep } from "node:path";

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
 */
export function wrapInHtmlDocument(bodyHtml: string, title: string = "Nomad Document"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
