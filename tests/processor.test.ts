import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { processFile } from "../src/processor.ts";

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
});
