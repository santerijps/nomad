/**
 * Shared helpers for fetching remote resources and common HTML utilities
 * used by both the local embedder and the remote fetcher.
 */

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceAttrValue(
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

export function isRemoteUrl(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://") || src.startsWith("//");
}

/**
 * Resolves a possibly protocol-relative URL to a full URL.
 */
function toFullUrl(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}

/**
 * Fetches the text content of a remote URL.
 * Returns null if the fetch fails.
 */
export async function fetchRemoteText(url: string): Promise<string | null> {
  try {
    const res = await fetch(toFullUrl(url), { redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Fetches a remote URL and returns it as a base64 data URI.
 * Returns null if the fetch fails.
 */
export async function fetchRemoteDataUri(url: string, mimeHint?: string): Promise<string | null> {
  try {
    const res = await fetch(toFullUrl(url), { redirect: "follow" });
    if (!res.ok) return null;
    const mime = mimeHint ?? res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
    const bytes = await res.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Resolves a relative URL against a base URL.
 * Returns null for data URIs or invalid URLs.
 */
export function resolveUrl(src: string, baseUrl: string): string | null {
  if (src.startsWith("data:")) return null;
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Embeds url() references within remote CSS content by fetching each
 * referenced resource and converting to a data URI.
 */
export async function embedRemoteCssUrls(css: string, cssBaseUrl: string): Promise<string> {
  const urlRegex = /url\(["']?(?!data:)([^"')]+)["']?\)/gi;
  const matches = [...css.matchAll(urlRegex)];

  for (const match of matches) {
    const rawUrl = match[1];
    if (!rawUrl) continue;
    const absUrl = resolveUrl(rawUrl, cssBaseUrl);
    if (!absUrl) continue;
    const dataUri = await fetchRemoteDataUri(absUrl);
    if (dataUri) {
      css = css.replaceAll(match[0], `url("${dataUri}")`);
    }
  }
  return css;
}
