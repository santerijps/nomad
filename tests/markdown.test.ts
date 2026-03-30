import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { markdownToHtml, wrapInHtmlDocument } from "../src/markdown.ts";
import { preprocessEmbeds } from "../src/markdown.ts";

const FIXTURES = resolve(import.meta.dir, "fixtures");

describe("markdownToHtml", () => {
  test("converts basic markdown to HTML", async () => {
    const html = await markdownToHtml("# Hello\n\nWorld", FIXTURES);
    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
    expect(html).toContain("<p>World</p>");
  });

  test("converts bold and italic text", async () => {
    const html = await markdownToHtml("**bold** and _italic_", FIXTURES);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  test("converts GFM tables", async () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = await markdownToHtml(md, FIXTURES);
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  test("converts GFM strikethrough", async () => {
    const html = await markdownToHtml("~~deleted~~", FIXTURES);
    expect(html).toContain("<del>deleted</del>");
  });

  test("converts GFM task lists", async () => {
    const md = "- [x] Done\n- [ ] Todo";
    const html = await markdownToHtml(md, FIXTURES);
    expect(html).toContain("checked");
  });

  test("generates heading IDs", async () => {
    const html = await markdownToHtml("## My Section", FIXTURES);
    expect(html).toContain('id="my-section"');
  });

  test("converts links", async () => {
    const html = await markdownToHtml("[Google](https://google.com)", FIXTURES);
    expect(html).toContain('href="https://google.com"');
    expect(html).toContain("Google");
  });

  test("converts images", async () => {
    const html = await markdownToHtml("![Alt](image.png)", FIXTURES);
    expect(html).toContain("<img");
    expect(html).toContain('src="image.png"');
    expect(html).toContain('alt="Alt"');
  });

  test("converts code blocks", async () => {
    const html = await markdownToHtml("```js\nconsole.log('hi')\n```", FIXTURES);
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
  });
});

describe("preprocessEmbeds", () => {
  test("embeds file content with {{embed:...}} directive", async () => {
    const md = "Before\n\n{{embed:component.html}}\n\nAfter";
    const result = await preprocessEmbeds(md, FIXTURES);
    expect(result).toContain("Embedded content here.");
    expect(result).toContain("Before");
    expect(result).toContain("After");
    expect(result).not.toContain("{{embed:");
  });

  test("leaves comment for missing files", async () => {
    const md = "{{embed:nonexistent.txt}}";
    const result = await preprocessEmbeds(md, FIXTURES);
    expect(result).toContain("<!-- nomad: file not found:");
  });

  test("blocks path traversal outside root directory", async () => {
    const md = "{{embed:../../package.json}}";
    const result = await preprocessEmbeds(md, FIXTURES);
    expect(result).toContain("<!-- nomad: path outside root blocked:");
    expect(result).not.toContain("nomad-ssg");
  });

  test("handles circular embeds without stack overflow", async () => {
    const md = "{{embed:cycle-a.md}}";
    const result = await preprocessEmbeds(md, FIXTURES);
    // Should terminate and not throw; exact content depends on depth limit
    expect(typeof result).toBe("string");
  });

  test("returns unchanged markdown without embed directives", async () => {
    const md = "# Hello\n\nNo embeds here.";
    const result = await preprocessEmbeds(md, FIXTURES);
    expect(result).toBe(md);
  });
});

describe("wrapInHtmlDocument", () => {
  test("wraps content in a valid HTML document", () => {
    const html = wrapInHtmlDocument("<p>Hello</p>", "Test Title");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("<head>");
    expect(html).toContain("<title>Test Title</title>");
    expect(html).toContain("<body>");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("</html>");
  });

  test("uses default title when none provided", () => {
    const html = wrapInHtmlDocument("<p>Hi</p>");
    expect(html).toContain("<title>Nomad Document</title>");
  });

  test("escapes HTML in title", () => {
    const html = wrapInHtmlDocument("<p>Hi</p>", '<script>alert("xss")</script>');
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
