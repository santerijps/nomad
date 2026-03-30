/**
 * Fetches a remote web page and embeds all its resources into a single
 * self-contained HTML file. Handles images, stylesheets, scripts,
 * video/audio sources, and CSS url() references.
 */

import {
  escapeRegex,
  replaceAttrValue,
  fetchRemoteText,
  fetchRemoteDataUri,
  resolveUrl,
  embedRemoteCssUrls,
} from "./remote.ts";

export function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
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
  html = await embedRemoteStyleCssUrls(html, baseUrl);

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
    const dataUri = await fetchRemoteDataUri(absUrl);
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
    let css = await fetchRemoteText(absUrl);
    if (css) {
      css = await embedRemoteCssUrls(css, absUrl);
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
    const content = await fetchRemoteText(absUrl);
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
    const dataUri = await fetchRemoteDataUri(absUrl);
    if (dataUri) {
      html = replaceAttrValue(html, `${tag}|source`, "src", src, dataUri);
    }
  }
  return html;
}

/**
 * Embeds url() references within already-inlined <style> blocks
 * by resolving them against the original page URL.
 */
async function embedRemoteStyleCssUrls(html: string, baseUrl: string): Promise<string> {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const matches = [...html.matchAll(styleRegex)];

  for (const match of matches) {
    const originalCss = match[1];
    if (!originalCss) continue;
    const embeddedCss = await embedRemoteCssUrls(originalCss, baseUrl);
    if (embeddedCss !== originalCss) {
      const fullOriginal = match[0];
      const fullReplacement = fullOriginal.replace(originalCss, () => embeddedCss);
      html = html.replace(fullOriginal, () => fullReplacement);
    }
  }
  return html;
}
