import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { processFile, rewriteLocalMdLinks } from "../src/processor.ts";

const FIXTURES = resolve(import.meta.dir, "fixtures");

describe("processFile", () => {
  test("processes a markdown file into a complete HTML document", async () => {
    const result = await processFile(resolve(FIXTURES, "sample.md"));
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<title>Test Document</title>");
    expect(result).toContain("<strong>test</strong>");
    expect(result).toContain("<em>emphasis</em>");
    expect(result).toContain("<li>");
  });

  test("processes an HTML file and embeds resources", async () => {
    const result = await processFile(resolve(FIXTURES, "sample.html"));
    expect(result).toContain("<!DOCTYPE html>");
    // CSS should be inlined
    expect(result).toContain("<style>");
    expect(result).toContain("font-family: sans-serif");
    // JS should be inlined
    expect(result).toContain("Hello from app.js");
    // Image should be data URI
    expect(result).toContain("data:image/png;base64,");
  });

  test("processes markdown with embed directives", async () => {
    const result = await processFile(resolve(FIXTURES, "embed-test.md"));
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("Embedded content here.");
    expect(result).toContain("After Embed");
  });

  test("processes markdown with images and embeds them", async () => {
    const result = await processFile(resolve(FIXTURES, "with-image.md"));
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("data:image/png;base64,");
  });

  test("throws for non-existent file", async () => {
    await expect(processFile(resolve(FIXTURES, "nonexistent.md"))).rejects.toThrow(
      "File not found"
    );
  });

  test("throws for unsupported file type", async () => {
    await expect(processFile(resolve(FIXTURES, "app.js"))).rejects.toThrow(
      "Unsupported file type"
    );
  });

  test("rewrites .md links to .html in processed markdown", async () => {
    const result = await processFile(resolve(FIXTURES, "linked-site", "index.md"));
    expect(result).toContain('href="about.html"');
    expect(result).toContain('href="sub/page.html"');
  });

  test("rewrites .md links with anchors to .html", async () => {
    const result = await processFile(resolve(FIXTURES, "linked-site", "index.md"));
    expect(result).toContain('href="about.html#faq"');
  });

  test("preserves external .md URLs", async () => {
    const result = await processFile(resolve(FIXTURES, "linked-site", "index.md"));
    expect(result).toContain('href="https://example.com/page.md"');
  });

  test("rewrites relative ../ .md links to .html", async () => {
    const result = await processFile(resolve(FIXTURES, "linked-site", "sub", "page.md"));
    expect(result).toContain('href="../index.html"');
    expect(result).toContain('href="../about.html"');
  });
});

describe("rewriteLocalMdLinks", () => {
  test("rewrites simple .md href to .html", () => {
    const input = '<a href="about.md">About</a>';
    expect(rewriteLocalMdLinks(input)).toBe('<a href="about.html">About</a>');
  });

  test("rewrites .md href with anchor", () => {
    const input = '<a href="about.md#section">About</a>';
    expect(rewriteLocalMdLinks(input)).toBe('<a href="about.html#section">About</a>');
  });

  test("rewrites relative path .md href", () => {
    const input = '<a href="sub/page.md">Page</a>';
    expect(rewriteLocalMdLinks(input)).toBe('<a href="sub/page.html">Page</a>');
  });

  test("rewrites parent-relative .md href", () => {
    const input = '<a href="../index.md">Home</a>';
    expect(rewriteLocalMdLinks(input)).toBe('<a href="../index.html">Home</a>');
  });

  test("does not rewrite remote .md URLs", () => {
    const input = '<a href="https://example.com/page.md">Remote</a>';
    expect(rewriteLocalMdLinks(input)).toBe(input);
  });

  test("does not rewrite protocol-relative .md URLs", () => {
    const input = '<a href="//cdn.example.com/page.md">CDN</a>';
    expect(rewriteLocalMdLinks(input)).toBe(input);
  });

  test("does not rewrite non-.md links", () => {
    const input = '<a href="style.css">CSS</a>';
    expect(rewriteLocalMdLinks(input)).toBe(input);
  });

  test("rewrites multiple .md links in same HTML", () => {
    const input = '<a href="index.md">Home</a><a href="about.md">About</a>';
    const expected = '<a href="index.html">Home</a><a href="about.html">About</a>';
    expect(rewriteLocalMdLinks(input)).toBe(expected);
  });

  test("handles single-quoted href", () => {
    const input = "<a href='about.md'>About</a>";
    expect(rewriteLocalMdLinks(input)).toBe("<a href='about.html'>About</a>");
  });
});
