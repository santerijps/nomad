import { describe, expect, test } from "bun:test";
import { minifyHtml } from "../src/minifier.ts";

describe("minifyHtml", () => {
  test("removes HTML comments", () => {
    const html = "<div><!-- this is a comment --><p>Hello</p></div>";
    const result = minifyHtml(html);
    expect(result).not.toContain("<!-- this is a comment -->");
    expect(result).toContain("<p>Hello</p>");
  });

  test("preserves conditional comments", () => {
    const html = "<!--[if IE]><p>IE only</p><![endif]-->";
    const result = minifyHtml(html);
    expect(result).toContain("<!--[if IE]>");
  });

  test("collapses whitespace between tags", () => {
    const html = "<div>   <p>Hello</p>   <p>World</p>   </div>";
    const result = minifyHtml(html);
    expect(result).toContain("<div><p>");
    expect(result).toContain("</p><p>");
  });

  test("minifies inline CSS within style tags", () => {
    const html = '<style>  body {  color: red;  font-size: 14px;  }  </style>';
    const result = minifyHtml(html);
    expect(result).toContain("body{color:red;font-size:14px;}");
    expect(result).not.toContain("  body");
  });

  test("removes CSS comments", () => {
    const html = "<style>/* comment */ body { color: red; }</style>";
    const result = minifyHtml(html);
    expect(result).not.toContain("/* comment */");
    expect(result).toContain("body{color:red;}");
  });

  test("minifies inline JS within script tags", () => {
    const html = '<script>\n  // comment\n  console.log("hi");\n</script>';
    const result = minifyHtml(html);
    expect(result).not.toContain("// comment");
    expect(result).toContain('console.log("hi");');
  });

  test("produces smaller output than input", () => {
    const html = `<!DOCTYPE html>
<html>
  <head>
    <!-- metadata -->
    <style>
      body {
        color: red;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <h1>Hello</h1>
    <p>World</p>
    <script>
      // app code
      console.log("hello");
    </script>
  </body>
</html>`;
    const result = minifyHtml(html);
    expect(result.length).toBeLessThan(html.length);
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<h1>Hello</h1>");
  });

  test("handles empty input", () => {
    expect(minifyHtml("")).toBe("");
  });

  test("handles input with no minifiable content", () => {
    const html = "<p>Hello</p>";
    const result = minifyHtml(html);
    expect(result).toContain("<p>Hello</p>");
  });

  test("preserves whitespace around + and - in CSS calc()", () => {
    const html = "<style>div { width: calc(100% + 20px); margin: calc(50vh - 10rem); }</style>";
    const result = minifyHtml(html);
    expect(result).toContain("calc(100% + 20px)");
    expect(result).toContain("calc(50vh - 10rem)");
  });

  test("does not corrupt JS template literals", () => {
    const html = '<script>const t = `line1\n  indented`;console.log(t);</script>';
    const result = minifyHtml(html);
    expect(result).toContain("const t = `line1");
    expect(result).toContain("console.log(t)");
  });
});
