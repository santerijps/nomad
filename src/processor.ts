import { dirname, extname, basename } from "node:path";
import { markdownToHtml, wrapInHtmlDocument } from "./markdown.ts";
import { embedResources } from "./embedder.ts";

/**
 * Processes a single file (Markdown or HTML) and returns the fully
 * portable HTML output with all resources embedded.
 */
export async function processFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await file.text();
  const ext = extname(filePath).toLowerCase();
  const baseDir = dirname(filePath);

  let html: string;

  if (ext === ".md") {
    const bodyHtml = await markdownToHtml(content, baseDir);
    const title = extractTitleFromMarkdown(content) ?? basename(filePath, ext);
    html = wrapInHtmlDocument(bodyHtml, title);
  } else if (ext === ".html" || ext === ".htm") {
    html = content;
  } else {
    throw new Error(`Unsupported file type: ${ext}. Only .md and .html files are supported.`);
  }

  // Embed all local resources into the HTML
  html = await embedResources(html, baseDir);

  return html;
}

/**
 * Extracts the first H1 heading from markdown content for use as a title.
 */
function extractTitleFromMarkdown(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}
