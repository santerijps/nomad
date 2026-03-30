/**
 * Minifies HTML by removing unnecessary whitespace, comments, and
 * compressing inline CSS/JS.
 */
export function minifyHtml(html: string): string {
  // Remove HTML comments (but preserve conditional comments like <!--[if IE]>)
  html = html.replace(/<!--(?!\[if\s)[\s\S]*?-->/gi, "");

  // Minify inline CSS within <style> tags (before general whitespace collapse)
  html = html.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, open: string, css: string, close: string) => {
      return open + minifyCss(css) + close;
    }
  );

  // Minify inline JS within <script> tags (before general whitespace collapse)
  html = html.replace(
    /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_match, open: string, js: string, close: string) => {
      return open + minifyJs(js) + close;
    }
  );

  // Collapse whitespace between tags
  html = html.replace(/>\s+</g, "><");

  // Collapse runs of whitespace to a single space inside text nodes
  html = html.replace(/\s{2,}/g, " ");

  // Remove optional whitespace around = in attributes
  // e.g. class = "foo" -> class="foo"
  html = html.replace(/\s*=\s*/g, "=");

  // Trim leading/trailing whitespace
  html = html.trim();

  return html;
}

function minifyCss(css: string): string {
  // Remove CSS comments
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove whitespace around special characters
  css = css.replace(/\s*([{}:;,>~+])\s*/g, "$1");
  // Collapse remaining whitespace
  css = css.replace(/\s{2,}/g, " ");
  return css.trim();
}

function minifyJs(js: string): string {
  // Remove single-line comments on their own line (not after code)
  js = js.replace(/^\s*\/\/.*$/gm, "");
  // Remove multi-line comments
  js = js.replace(/\/\*[\s\S]*?\*\//g, "");
  // Collapse runs of whitespace (conservative — won't break string literals in most cases)
  js = js.replace(/\n\s*/g, "\n");
  // Remove blank lines
  js = js.replace(/\n{2,}/g, "\n");
  return js.trim();
}
