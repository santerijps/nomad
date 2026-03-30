import { resolve, dirname } from "node:path";
import { getMimeType, isTextMime } from "./mime.ts";

export interface EmbedOptions {
  maxSize?: number | null;
  verbose?: boolean;
}

const warnings: string[] = [];

export function getEmbedWarnings(): string[] {
  return [...warnings];
}

export function clearEmbedWarnings(): void {
  warnings.length = 0;
}

/**
 * Reads a local file and returns it as a base64 data URI.
 * Returns null if the file cannot be read or exceeds maxSize.
 */
async function toDataUri(filePath: string, opts?: EmbedOptions): Promise<string | null> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
      if (opts?.verbose) warnings.push(`Not found: ${filePath}`);
      return null;
    }

    if (opts?.maxSize) {
      const size = file.size;
      if (size > opts.maxSize) {
        if (opts?.verbose) warnings.push(`Skipped (${size} bytes > ${opts.maxSize} limit): ${filePath}`);
        return null;
      }
    }

    const mime = getMimeType(filePath);
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch {
    if (opts?.verbose) warnings.push(`Failed to read: ${filePath}`);
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
 * video, audio, PDFs, fonts, favicons, tracks, srcset/picture) directly
 * into the HTML as data URIs or inline content.
 */
export async function embedResources(html: string, baseDir: string, opts?: EmbedOptions): Promise<string> {
  clearEmbedWarnings();

  // Pass 1: Embed images (img[src])
  html = await embedImages(html, baseDir, opts);
  // Pass 2: Embed srcset on img/source elements
  html = await embedSrcset(html, baseDir, opts);
  // Pass 3: Embed CSS (link[rel=stylesheet][href])
  html = await embedStylesheets(html, baseDir, opts);
  // Pass 4: Embed JS (script[src])
  html = await embedScripts(html, baseDir, opts);
  // Pass 5: Embed video sources
  html = await embedMedia(html, baseDir, "video", opts);
  // Pass 6: Embed audio sources
  html = await embedMedia(html, baseDir, "audio", opts);
  // Pass 7: Embed PDFs (embed, object, iframe)
  html = await embedPdfs(html, baseDir, opts);
  // Pass 8: Embed CSS url() references within inline styles
  html = await embedCssUrls(html, baseDir, opts);
  // Pass 9: Embed favicons (link[rel=icon])
  html = await embedFavicons(html, baseDir, opts);
  // Pass 10: Embed track subtitles/captions
  html = await embedTracks(html, baseDir, opts);
  // Pass 11: Embed inline style attribute url() references
  html = await embedInlineStyleUrls(html, baseDir, opts);

  return html;
}

async function embedImages(html: string, baseDir: string, opts?: EmbedOptions): Promise<string> {
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
    const dataUri = await toDataUri(localPath, opts);
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

/**
 * Embeds srcset attribute values on <img> and <source> elements.
 */
async function embedSrcset(html: string, baseDir: string, opts?: EmbedOptions): Promise<string> {
  const srcsetRegex = /(<(?:img|source)\s[^>]*srcset=["'])([^"']+)(["'])/gi;
  const matches = [...html.matchAll(srcsetRegex)];

  for (const match of matches) {
    const originalSrcset = match[2]!;
    const entries = originalSrcset.split(",").map(s => s.trim());
    const newEntries: string[] = [];

    for (const entry of entries) {
      const parts = entry.split(/\s+/);
      const url = parts[0]!;
      const descriptor = parts.slice(1).join(" ");

      if (isRemoteUrl(url) || url.startsWith("data:")) {
        newEntries.push(entry);
        continue;
      }

      const localPath = resolveLocalPath(url, baseDir);
      const dataUri = await toDataUri(localPath, opts);
      if (dataUri) {
        newEntries.push(descriptor ? `${dataUri} ${descriptor}` : dataUri);
      } else {
        newEntries.push(entry);
      }
    }

    const newSrcset = newEntries.join(", ");
    html = html.replace(match[0], `${match[1]}${newSrcset}${match[3]}`);
  }

  return html;
}

async function embedStylesheets(html: string, baseDir: string, opts?: EmbedOptions): Promise<string> {
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
      content = await embedCssUrlReferences(content, cssDir, opts);
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

async function embedScripts(html: string, baseDir: string, opts?: EmbedOptions): Promise<string> {
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
    if (content) {
      // Transpile TypeScript to JavaScript
      if (/\.tsx?$/i.test(script.src)) {
        const transpiler = new Bun.Transpiler({ loader: script.src.endsWith("x") ? "tsx" : "ts" });
        script.content = transpiler.transformSync(content);
      } else {
        script.content = content;
      }
    }
  }

  let result = html;
  for (const script of scripts) {
    if (script.content) {
      // Replace <script src="..."></script> with <script>content</script>
      const scriptRegex = new RegExp(
        `<script([^>]*)src=["']${escapeRegex(script.src)}["']([^>]*)>[\\s\\S]*?</script>`,
        "gi"
      );
      const isTs = /\.tsx?$/i.test(script.src);
      result = result.replace(scriptRegex, (_match, before: string, after: string) => {
        // Remove the src attribute but keep other attributes (like type)
        let attrs = (before + after).trim();
        // Strip TypeScript type attributes since the content is now plain JS
        if (isTs) {
          attrs = attrs.replace(/\s*type=["'](?:text\/typescript|application\/typescript|module)["']/gi, "");
        }
        return `<script${attrs ? " " + attrs : ""}>${script.content}</script>`;
      });
    }
  }
  return result;
}

async function embedMedia(
  html: string,
  baseDir: string,
  tag: "video" | "audio",
  opts?: EmbedOptions,
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
    const dataUri = await toDataUri(localPath, opts);
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

async function embedPdfs(html: string, baseDir: string, opts?: EmbedOptions): Promise<string> {
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
    const dataUri = await toDataUri(localPath, opts);
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
async function embedCssUrlReferences(css: string, cssDir: string, opts?: EmbedOptions): Promise<string> {
  const urlRegex = /url\(["']?(?!data:|https?:\/\/|\/\/)([^"')]+)["']?\)/gi;
  const matches = [...css.matchAll(urlRegex)];

  for (const match of matches) {
    const rawUrl = match[1];
    if (!rawUrl) continue;
    const localPath = resolveLocalPath(rawUrl, cssDir);
    const dataUri = await toDataUri(localPath, opts);
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
async function embedCssUrls(html: string, baseDir: string, opts?: EmbedOptions): Promise<string> {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const matches = [...html.matchAll(styleRegex)];

  for (const match of matches) {
    const originalCss = match[1];
    if (!originalCss) continue;
    const embeddedCss = await embedCssUrlReferences(originalCss, baseDir, opts);
    if (embeddedCss !== originalCss) {
      const fullOriginal = match[0];
      const fullReplacement = fullOriginal.replace(originalCss, () => embeddedCss);
      html = html.replace(fullOriginal, () => fullReplacement);
    }
  }
  return html;
}

/**
 * Embeds <link rel="icon"> favicon references as data URIs.
 */
async function embedFavicons(html: string, baseDir: string, opts?: EmbedOptions): Promise<string> {
  const favicons: Array<{ href: string; dataUri: string }> = [];

  new HTMLRewriter()
    .on('link[rel="icon"], link[rel="shortcut icon"], link[rel=icon]', {
      element(el) {
        const href = el.getAttribute("href");
        if (href && !isRemoteUrl(href) && !href.startsWith("data:")) {
          favicons.push({ href, dataUri: "" });
        }
      },
    })
    .transform(html);

  for (const f of favicons) {
    const localPath = resolveLocalPath(f.href, baseDir);
    const dataUri = await toDataUri(localPath, opts);
    if (dataUri) f.dataUri = dataUri;
  }

  let result = html;
  for (const f of favicons) {
    if (f.dataUri) {
      result = replaceAttrValue(result, "link", "href", f.href, f.dataUri);
    }
  }
  return result;
}

/**
 * Embeds <track> subtitle/caption src references as data URIs.
 */
async function embedTracks(html: string, baseDir: string, opts?: EmbedOptions): Promise<string> {
  const tracks: Array<{ src: string; dataUri: string }> = [];

  new HTMLRewriter()
    .on("track[src]", {
      element(el) {
        const src = el.getAttribute("src");
        if (src && !isRemoteUrl(src) && !src.startsWith("data:")) {
          tracks.push({ src, dataUri: "" });
        }
      },
    })
    .transform(html);

  for (const t of tracks) {
    const localPath = resolveLocalPath(t.src, baseDir);
    const dataUri = await toDataUri(localPath, opts);
    if (dataUri) t.dataUri = dataUri;
  }

  let result = html;
  for (const t of tracks) {
    if (t.dataUri) {
      result = replaceAttrValue(result, "track", "src", t.src, t.dataUri);
    }
  }
  return result;
}

/**
 * Embeds url() references within inline style="" attributes.
 */
async function embedInlineStyleUrls(html: string, baseDir: string, opts?: EmbedOptions): Promise<string> {
  const styleAttrRegex = /style="([^"]*url\([^)]+\)[^"]*)"/gi;
  const matches = [...html.matchAll(styleAttrRegex)];

  for (const match of matches) {
    const originalStyle = match[1]!;
    const embeddedStyle = await embedCssUrlReferences(originalStyle, baseDir, opts);
    if (embeddedStyle !== originalStyle) {
      html = html.replace(
        `style="${originalStyle}"`,
        `style="${embeddedStyle}"`
      );
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
