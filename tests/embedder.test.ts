import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { embedResources } from "../src/embedder.ts";

const FIXTURES = resolve(import.meta.dir, "fixtures");

describe("embedResources", () => {
  test("embeds local images as data URIs", async () => {
    const html = '<html><body><img src="pixel.png" alt="test"></body></html>';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("data:image/png;base64,");
    expect(result).not.toContain('src="pixel.png"');
  });

  test("does not modify remote image URLs", async () => {
    const html = '<img src="https://example.com/image.png">';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain('src="https://example.com/image.png"');
  });

  test("does not modify data URI images", async () => {
    const html = '<img src="data:image/png;base64,abc123">';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain('src="data:image/png;base64,abc123"');
  });

  test("embeds local CSS as inline style tags", async () => {
    const html = '<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("<style>");
    expect(result).toContain("font-family: sans-serif");
    expect(result).not.toContain('<link rel="stylesheet"');
  });

  test("embeds local JS as inline script tags", async () => {
    const html = '<html><body><script src="app.js"></script></body></html>';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("Hello from app.js");
    expect(result).not.toContain('src="app.js"');
  });

  test("leaves non-existent file references unchanged", async () => {
    const html = '<img src="nonexistent.png">';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain('src="nonexistent.png"');
  });

  test("does not modify remote stylesheet URLs", async () => {
    const html = '<link rel="stylesheet" href="https://cdn.example.com/style.css">';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain('href="https://cdn.example.com/style.css"');
  });

  test("does not modify remote script URLs", async () => {
    const html = '<script src="https://cdn.example.com/app.js"></script>';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain('src="https://cdn.example.com/app.js"');
  });

  test("handles HTML with no embeddable resources", async () => {
    const html = "<html><body><p>Hello world</p></body></html>";
    const result = await embedResources(html, FIXTURES);
    expect(result).toBe(html);
  });
});
