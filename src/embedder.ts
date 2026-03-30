import { resolve, dirname } from "node:path";
import { getMimeType, isTextMime } from "./mime.ts";

/**
 * Reads a local file and returns it as a base64 data URI.
 * Returns null if the file cannot be read.
 */
async function toDataUri(filePath: string): Promise<string | null> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) return null;

    const mime = getMimeType(filePath);
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Reads a local text file and returns its contents.
 * Returns null if the file cannot be read.
 */
async function readTextFile(filePath: string): Promise<string | null> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) return null;
    return await file.text();
  } catch {
    return null;
  }
}

function isRemoteUrl(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://") || src.startsWith("//");
}

function resolveLocalPath(src: string, baseDir: string): string {
  return resolve(baseDir, src);
}

/**
 * Processes HTML content and embeds all local resources (images, CSS, JS,
 * video, audio, PDFs, fonts) directly into the HTML as data URIs or
 * inline content.
 */
export async function embedResources(html: string, baseDir: string): Promise<string> {
  // We need to collect async operations since HTMLRewriter handlers
  // with async operations can be tricky. Instead, we'll do multiple passes.

  // Pass 1: Embed images (img[src])
  html = await embedImages(html, baseDir);
  // Pass 2: Embed CSS (link[rel=stylesheet][href])
  html = await embedStylesheets(html, baseDir);
  // Pass 3: Embed JS (script[src])
  html = await embedScripts(html, baseDir);
  // Pass 4: Embed video sources
  html = await embedMedia(html, baseDir, "video");
  // Pass 5: Embed audio sources
  html = await embedMedia(html, baseDir, "audio");
  // Pass 6: Embed PDFs (embed, object, iframe)
  html = await embedPdfs(html, baseDir);
  // Pass 7: Embed CSS url() references within inline styles
  html = await embedCssUrls(html, baseDir);

  return html;
}

async function embedImages(html: string, baseDir: string): Promise<string> {
  const replacements: Array<{ src: string; dataUri: string }> = [];

  // Collect all img src values
  new HTMLRewriter()
    .on("img", {
      element(el) {
        const src = el.getAttribute("src");
        if (src && !isRemoteUrl(src) && !src.startsWith("data:")) {
          replacements.push({ src, dataUri: "" });
        }
      },
    })
    .transform(html);

  // Resolve data URIs
  for (const r of replacements) {
    const localPath = resolveLocalPath(r.src, baseDir);
    const dataUri = await toDataUri(localPath);
    if (dataUri) r.dataUri = dataUri;
  }

  // Apply replacements
  let result = html;
  for (const r of replacements) {
    if (r.dataUri) {
      result = replaceAttrValue(result, "img", "src", r.src, r.dataUri);
    }
  }
  return result;
}

async function embedStylesheets(html: string, baseDir: string): Promise<string> {
  const links: Array<{ href: string; content: string }> = [];

  new HTMLRewriter()
    .on('link[rel="stylesheet"], link[rel=stylesheet]', {
      element(el) {
        const href = el.getAttribute("href");
        if (href && !isRemoteUrl(href)) {
          links.push({ href, content: "" });
        }
      },
    })
    .transform(html);

  for (const link of links) {
    const localPath = resolveLocalPath(link.href, baseDir);
    let content = await readTextFile(localPath);
    if (content) {
      // Also embed url() references within the CSS
      const cssDir = dirname(localPath);
      content = await embedCssUrlReferences(content, cssDir);
      link.content = content;
    }
  }

  let result = html;
  for (const link of links) {
    if (link.content) {
      // Replace <link rel="stylesheet" href="..."> with <style>...</style>
      const linkRegex = new RegExp(
        `<link[^>]*href=["']${escapeRegex(link.href)}["'][^>]*>`,
        "gi"
      );
      result = result.replace(linkRegex, `<style>${link.content}</style>`);
    }
  }
  return result;
}

async function embedScripts(html: string, baseDir: string): Promise<string> {
  const scripts: Array<{ src: string; content: string }> = [];

  new HTMLRewriter()
    .on("script[src]", {
      element(el) {
        const src = el.getAttribute("src");
        if (src && !isRemoteUrl(src)) {
          scripts.push({ src, content: "" });
        }
      },
    })
    .transform(html);

  for (const script of scripts) {
    const localPath = resolveLocalPath(script.src, baseDir);
    const content = await readTextFile(localPath);
    if (content) script.content = content;
  }

  let result = html;
  for (const script of scripts) {
    if (script.content) {
      // Replace <script src="..."></script> with <script>content</script>
      const scriptRegex = new RegExp(
        `<script([^>]*)src=["']${escapeRegex(script.src)}["']([^>]*)>[\\s\\S]*?</script>`,
        "gi"
      );
      result = result.replace(scriptRegex, (_match, before: string, after: string) => {
        // Remove the src attribute but keep other attributes (like type)
        const attrs = (before + after).trim();
        return `<script${attrs ? " " + attrs : ""}>${script.content}</script>`;
      });
    }
  }
  return result;
}

async function embedMedia(
  html: string,
  baseDir: string,
  tag: "video" | "audio"
): Promise<string> {
  const sources: Array<{ src: string; dataUri: string }> = [];

  new HTMLRewriter()
    .on(`${tag}[src], ${tag} source[src]`, {
      element(el) {
        const src = el.getAttribute("src");
        if (src && !isRemoteUrl(src) && !src.startsWith("data:")) {
          sources.push({ src, dataUri: "" });
        }
      },
    })
    .transform(html);

  for (const s of sources) {
    const localPath = resolveLocalPath(s.src, baseDir);
    const dataUri = await toDataUri(localPath);
    if (dataUri) s.dataUri = dataUri;
  }

  let result = html;
  for (const s of sources) {
    if (s.dataUri) {
      result = replaceAttrValue(result, `${tag}|source`, "src", s.src, s.dataUri);
    }
  }
  return result;
}

async function embedPdfs(html: string, baseDir: string): Promise<string> {
  const embeds: Array<{ src: string; attr: string; dataUri: string }> = [];

  new HTMLRewriter()
    .on("embed[src], object[data], iframe[src]", {
      element(el) {
        const tag = el.tagName;
        const attrName = tag === "object" ? "data" : "src";
        const src = el.getAttribute(attrName);
        if (src && !isRemoteUrl(src) && !src.startsWith("data:")) {
          const mime = getMimeType(src);
          if (mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/")) {
            embeds.push({ src, attr: attrName, dataUri: "" });
          }
        }
      },
    })
    .transform(html);

  for (const e of embeds) {
    const localPath = resolveLocalPath(e.src, baseDir);
    const dataUri = await toDataUri(localPath);
    if (dataUri) e.dataUri = dataUri;
  }

  let result = html;
  for (const e of embeds) {
    if (e.dataUri) {
      result = replaceAttrValue(result, "embed|object|iframe", e.attr, e.src, e.dataUri);
    }
  }
  return result;
}

/**
 * Embeds url() references within CSS content.
 */
async function embedCssUrlReferences(css: string, cssDir: string): Promise<string> {
  const urlRegex = /url\(["']?(?!data:|https?:\/\/|\/\/)([^"')]+)["']?\)/gi;
  const matches = [...css.matchAll(urlRegex)];

  for (const match of matches) {
    const rawUrl = match[1];
    if (!rawUrl) continue;
    const localPath = resolveLocalPath(rawUrl, cssDir);
    const dataUri = await toDataUri(localPath);
    if (dataUri) {
      const replacement = `url("${dataUri}")`;
      css = css.replaceAll(match[0], replacement);
    }
  }
  return css;
}

/**
 * Embeds CSS url() references within <style> blocks in HTML.
 */
async function embedCssUrls(html: string, baseDir: string): Promise<string> {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const matches = [...html.matchAll(styleRegex)];

  for (const match of matches) {
    const originalCss = match[1];
    if (!originalCss) continue;
    const embeddedCss = await embedCssUrlReferences(originalCss, baseDir);
    if (embeddedCss !== originalCss) {
      const fullOriginal = match[0];
      const fullReplacement = fullOriginal.replace(originalCss, () => embeddedCss);
      html = html.replace(fullOriginal, () => fullReplacement);
    }
  }
  return html;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAttrValue(
  html: string,
  tagPattern: string,
  attr: string,
  oldValue: string,
  newValue: string
): string {
  const regex = new RegExp(
    `(<(?:${tagPattern})\\s[^>]*${attr}=["'])${escapeRegex(oldValue)}(["'])`,
    "gi"
  );
  return html.replace(regex, `$1${newValue}$2`);
}
