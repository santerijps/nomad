/**
 * Fetches a remote web page and embeds all its resources into a single
 * self-contained HTML file. Handles images, stylesheets, scripts,
 * video/audio sources, and CSS url() references.
 */

export function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function resolveUrl(src: string, baseUrl: string): string | null {
  if (src.startsWith("data:")) return null;
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

async function toRemoteDataUri(url: string, mimeHint?: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const mime = mimeHint ?? res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
    const bytes = await res.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAttrValue(
  html: string,
  tagPattern: string,
  attr: string,
  oldValue: string,
  newValue: string,
): string {
  const regex = new RegExp(
    `(<(?:${tagPattern})\\s[^>]*${attr}=["'])${escapeRegex(oldValue)}(["'])`,
    "gi",
  );
  return html.replace(regex, `$1${newValue}$2`);
}

/**
 * Downloads a remote web page and embeds all of its resources,
 * returning a fully self-contained HTML string.
 */
export async function fetchAndEmbed(pageUrl: string): Promise<string> {
  const res = await fetch(pageUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to fetch "${pageUrl}": ${res.status} ${res.statusText}`);
  }
  let html = await res.text();
  const baseUrl = res.url; // follow redirects

  html = await embedRemoteImages(html, baseUrl);
  html = await embedRemoteStylesheets(html, baseUrl);
  html = await embedRemoteScripts(html, baseUrl);
  html = await embedRemoteMedia(html, baseUrl, "video");
  html = await embedRemoteMedia(html, baseUrl, "audio");
  html = await embedRemoteCssUrls(html, baseUrl);

  return html;
}

async function embedRemoteImages(html: string, baseUrl: string): Promise<string> {
  const srcs: string[] = [];

  new HTMLRewriter()
    .on("img", {
      element(el) {
        const src = el.getAttribute("src");
        if (src && !src.startsWith("data:")) srcs.push(src);
      },
    })
    .transform(html);

  for (const src of srcs) {
    const absUrl = resolveUrl(src, baseUrl);
    if (!absUrl) continue;
    const dataUri = await toRemoteDataUri(absUrl);
    if (dataUri) {
      html = replaceAttrValue(html, "img", "src", src, dataUri);
    }
  }
  return html;
}

async function embedRemoteStylesheets(html: string, baseUrl: string): Promise<string> {
  const hrefs: string[] = [];

  new HTMLRewriter()
    .on('link[rel="stylesheet"], link[rel=stylesheet]', {
      element(el) {
        const href = el.getAttribute("href");
        if (href) hrefs.push(href);
      },
    })
    .transform(html);

  for (const href of hrefs) {
    const absUrl = resolveUrl(href, baseUrl);
    if (!absUrl) continue;
    let css = await fetchText(absUrl);
    if (css) {
      css = await embedRemoteCssUrlReferences(css, absUrl);
      const linkRegex = new RegExp(
        `<link[^>]*href=["']${escapeRegex(href)}["'][^>]*>`,
        "gi",
      );
      html = html.replace(linkRegex, `<style>${css}</style>`);
    }
  }
  return html;
}

async function embedRemoteScripts(html: string, baseUrl: string): Promise<string> {
  const srcs: string[] = [];

  new HTMLRewriter()
    .on("script[src]", {
      element(el) {
        const src = el.getAttribute("src");
        if (src) srcs.push(src);
      },
    })
    .transform(html);

  for (const src of srcs) {
    const absUrl = resolveUrl(src, baseUrl);
    if (!absUrl) continue;
    const content = await fetchText(absUrl);
    if (content) {
      const scriptRegex = new RegExp(
        `<script([^>]*)src=["']${escapeRegex(src)}["']([^>]*)>[\\s\\S]*?</script>`,
        "gi",
      );
      html = html.replace(scriptRegex, (_match, before: string, after: string) => {
        const attrs = (before + after).trim();
        return `<script${attrs ? " " + attrs : ""}>${content}</script>`;
      });
    }
  }
  return html;
}

async function embedRemoteMedia(
  html: string,
  baseUrl: string,
  tag: "video" | "audio",
): Promise<string> {
  const srcs: string[] = [];

  new HTMLRewriter()
    .on(`${tag}[src], ${tag} source[src]`, {
      element(el) {
        const src = el.getAttribute("src");
        if (src && !src.startsWith("data:")) srcs.push(src);
      },
    })
    .transform(html);

  for (const src of srcs) {
    const absUrl = resolveUrl(src, baseUrl);
    if (!absUrl) continue;
    const dataUri = await toRemoteDataUri(absUrl);
    if (dataUri) {
      html = replaceAttrValue(html, `${tag}|source`, "src", src, dataUri);
    }
  }
  return html;
}

async function embedRemoteCssUrlReferences(css: string, cssBaseUrl: string): Promise<string> {
  const urlRegex = /url\(["']?(?!data:)([^"')]+)["']?\)/gi;
  const matches = [...css.matchAll(urlRegex)];

  for (const match of matches) {
    const rawUrl = match[1];
    if (!rawUrl) continue;
    const absUrl = resolveUrl(rawUrl, cssBaseUrl);
    if (!absUrl) continue;
    const dataUri = await toRemoteDataUri(absUrl);
    if (dataUri) {
      const replacement = `url("${dataUri}")`;
      css = css.replaceAll(match[0], replacement);
    }
  }
  return css;
}

async function embedRemoteCssUrls(html: string, baseUrl: string): Promise<string> {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const matches = [...html.matchAll(styleRegex)];

  for (const match of matches) {
    const originalCss = match[1];
    if (!originalCss) continue;
    const embeddedCss = await embedRemoteCssUrlReferences(originalCss, baseUrl);
    if (embeddedCss !== originalCss) {
      const fullOriginal = match[0];
      const fullReplacement = fullOriginal.replace(originalCss, () => embeddedCss);
      html = html.replace(fullOriginal, () => fullReplacement);
    }
  }
  return html;
}
