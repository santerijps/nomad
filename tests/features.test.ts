import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { parseFrontmatter, generateToc, highlightCodeBlocks, applyTemplate, wrapInHtmlDocument, markdownToHtml } from "../src/markdown.ts";
import { embedResources, getEmbedWarnings, clearEmbedWarnings } from "../src/embedder.ts";
import { processFile } from "../src/processor.ts";
import { minifyHtml } from "../src/minifier.ts";
import { parseArgs } from "../src/cli.ts";

const FIXTURES = resolve(import.meta.dir, "fixtures");

// ============================================================
// Feature 1: Custom Templates
// ============================================================
describe("custom templates", () => {
  test("applyTemplate replaces {{content}} and {{title}}", () => {
    const tpl = "<html><head><title>{{title}}</title></head><body>{{content}}</body></html>";
    const result = applyTemplate(tpl, "<p>Hello</p>", "My Title");
    expect(result).toContain("<title>My Title</title>");
    expect(result).toContain("<p>Hello</p>");
  });

  test("applyTemplate replaces metadata variables", () => {
    const tpl = '<meta name="author" content="{{author}}">';
    const result = applyTemplate(tpl, "", "Title", { author: "Jane" });
    expect(result).toContain('content="Jane"');
  });

  test("applyTemplate removes unreplaced variables", () => {
    const tpl = "{{title}} {{unknown}}";
    const result = applyTemplate(tpl, "", "Hi");
    expect(result).toBe("Hi ");
  });

  test("applyTemplate escapes HTML in values", () => {
    const tpl = "{{title}}";
    const result = applyTemplate(tpl, "", '<script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  test("processFile uses template when provided", async () => {
    const templatePath = resolve(FIXTURES, "template.html");
    const result = await processFile(resolve(FIXTURES, "frontmatter.md"), {
      template: templatePath,
    });
    expect(result).toContain("<header><h1>My Custom Title</h1></header>");
    expect(result).toContain("<main>");
    expect(result).toContain("By Jane Doe");
  });

  test("processFile throws for missing template", async () => {
    expect(
      processFile(resolve(FIXTURES, "sample.md"), { template: "nonexistent.html" })
    ).rejects.toThrow("Template not found");
  });
});

// ============================================================
// Feature 2: Table of Contents
// ============================================================
describe("table of contents", () => {
  test("generateToc extracts headings with IDs", () => {
    const html = '<h2 id="intro">Introduction</h2><h2 id="setup">Setup</h2>';
    const toc = generateToc(html);
    expect(toc).toContain('<nav class="toc">');
    expect(toc).toContain('<a href="#intro">Introduction</a>');
    expect(toc).toContain('<a href="#setup">Setup</a>');
  });

  test("generateToc returns empty string for no headings", () => {
    const toc = generateToc("<p>No headings here</p>");
    expect(toc).toBe("");
  });

  test("generateToc strips HTML tags from heading text", () => {
    const html = '<h2 id="test"><strong>Bold</strong> Heading</h2>';
    const toc = generateToc(html);
    expect(toc).toContain("Bold Heading");
    expect(toc).not.toContain("<strong>");
  });

  test("processFile includes TOC when toc option is true", async () => {
    const result = await processFile(resolve(FIXTURES, "toc-test.md"), { toc: true });
    expect(result).toContain('<nav class="toc">');
    expect(result).toContain("Getting Started");
    expect(result).toContain("Usage");
    expect(result).toContain("API Reference");
  });

  test("processFile does not include TOC when toc option is false", async () => {
    const result = await processFile(resolve(FIXTURES, "toc-test.md"), { toc: false });
    expect(result).not.toContain('<nav class="toc">');
  });
});

// ============================================================
// Feature 3: Syntax Highlighting
// ============================================================
describe("syntax highlighting", () => {
  test("highlightCodeBlocks adds spans to code blocks", () => {
    const html = '<pre><code class="language-js">const x = 42;</code></pre>';
    const result = highlightCodeBlocks(html);
    expect(result).toContain('class="highlight"');
    expect(result).toContain("color:");
  });

  test("highlightCodeBlocks highlights keywords", () => {
    const html = '<pre><code class="language-js">const name = &quot;hello&quot;;</code></pre>';
    const result = highlightCodeBlocks(html);
    expect(result).toContain("color:#c678dd"); // keyword color for const
  });

  test("highlightCodeBlocks highlights strings", () => {
    const html = '<pre><code class="language-js">const x = &quot;str&quot;;</code></pre>';
    const result = highlightCodeBlocks(html);
    expect(result).toContain("color:#98c379"); // string color
  });

  test("highlightCodeBlocks highlights numbers", () => {
    const html = '<pre><code class="language-js">const x = 42;</code></pre>';
    const result = highlightCodeBlocks(html);
    expect(result).toContain("color:#d19a66"); // number color
  });

  test("highlightCodeBlocks handles python keyword set", () => {
    const html = '<pre><code class="language-python">def greet():\n    return None</code></pre>';
    const result = highlightCodeBlocks(html);
    expect(result).toContain("color:#c678dd"); // keyword for def
  });

  test("highlightCodeBlocks does not modify non-language code blocks", () => {
    const html = '<pre><code>plain code</code></pre>';
    const result = highlightCodeBlocks(html);
    expect(result).toBe(html);
  });

  test("processFile applies syntax highlighting to markdown code blocks", async () => {
    const result = await processFile(resolve(FIXTURES, "code-blocks.md"));
    expect(result).toContain('class="highlight"');
  });
});

// ============================================================
// Feature 4: srcset / <picture> embedding
// ============================================================
describe("srcset embedding", () => {
  test("embeds srcset image references as data URIs", async () => {
    const html = '<img src="pixel.png" srcset="pixel.png 1x, pixel.png 2x" alt="test">';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("srcset=\"data:image/png;base64,");
    expect(result).toContain(" 1x");
    expect(result).toContain(" 2x");
  });

  test("leaves remote srcset URLs untouched", async () => {
    const html = '<img srcset="https://example.com/img.png 1x">';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("https://example.com/img.png");
  });

  test("processFile embeds srcset in HTML fixture", async () => {
    const result = await processFile(resolve(FIXTURES, "srcset.html"));
    expect(result).toContain("srcset=\"data:image/png;base64,");
  });
});

// ============================================================
// Feature 5: Inline style url() embedding
// ============================================================
describe("inline style url() embedding", () => {
  test("embeds url() in inline style attributes", async () => {
    const html = '<div style="background-image: url(\'pixel.png\')">test</div>';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("data:image/png;base64,");
    expect(result).not.toContain("url('pixel.png')");
  });

  test("processFile embeds inline style url() in fixture", async () => {
    const result = await processFile(resolve(FIXTURES, "inline-style.html"));
    expect(result).toContain("data:image/png;base64,");
  });
});

// ============================================================
// Feature 6: Watch mode (CLI flag parsing only - watch itself is integration)
// ============================================================
describe("watch mode", () => {
  test("parseArgs recognizes -w flag", () => {
    const args = parseArgs(["bun", "script.ts", "input.md", "-w", "-o", "out.html"]);
    expect(args.watch).toBe(true);
    expect(args.output).toBe("out.html");
  });

  test("parseArgs recognizes --watch flag", () => {
    const args = parseArgs(["bun", "script.ts", "input.md", "--watch", "-o", "out.html"]);
    expect(args.watch).toBe(true);
  });
});

// ============================================================
// Feature 7: Frontmatter metadata
// ============================================================
describe("frontmatter metadata", () => {
  test("parseFrontmatter extracts YAML metadata", () => {
    const md = "---\ntitle: Hello\nauthor: Jane\n---\n# Content";
    const result = parseFrontmatter(md);
    expect(result.metadata["title"]).toBe("Hello");
    expect(result.metadata["author"]).toBe("Jane");
    expect(result.content).toBe("# Content");
  });

  test("parseFrontmatter strips quotes from values", () => {
    const md = '---\ntitle: "Quoted Title"\nauthor: \'Single Quoted\'\n---\ncontent';
    const result = parseFrontmatter(md);
    expect(result.metadata["title"]).toBe("Quoted Title");
    expect(result.metadata["author"]).toBe("Single Quoted");
  });

  test("parseFrontmatter returns empty metadata for no frontmatter", () => {
    const md = "# No frontmatter\nJust content.";
    const result = parseFrontmatter(md);
    expect(result.metadata).toEqual({});
    expect(result.content).toBe(md);
  });

  test("parseFrontmatter handles empty frontmatter block", () => {
    const md = "---\n---\n# Content";
    const result = parseFrontmatter(md);
    expect(result.metadata).toEqual({});
    expect(result.content).toBe("# Content");
  });

  test("wrapInHtmlDocument includes meta tags from metadata", () => {
    const html = wrapInHtmlDocument("<p>body</p>", "Title", {
      description: "Test desc",
      author: "John",
      keywords: "a, b",
      date: "2024-01-01",
    });
    expect(html).toContain('<meta name="description" content="Test desc">');
    expect(html).toContain('<meta name="author" content="John">');
    expect(html).toContain('<meta name="keywords" content="a, b">');
    expect(html).toContain('<meta name="date" content="2024-01-01">');
  });

  test("wrapInHtmlDocument works without metadata", () => {
    const html = wrapInHtmlDocument("<p>body</p>", "Title");
    expect(html).toContain("<title>Title</title>");
    expect(html).not.toContain('name="description"');
  });

  test("processFile uses frontmatter title", async () => {
    const result = await processFile(resolve(FIXTURES, "frontmatter.md"));
    expect(result).toContain("<title>My Custom Title</title>");
    expect(result).toContain('content="Jane Doe"');
    expect(result).toContain('content="A test document with frontmatter"');
  });
});

// ============================================================
// Feature 8: Favicon embedding
// ============================================================
describe("favicon embedding", () => {
  test("embeds link rel=icon href as data URI", async () => {
    const html = '<html><head><link rel="icon" href="pixel.png"></head><body></body></html>';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("data:image/png;base64,");
    expect(result).not.toContain('href="pixel.png"');
  });

  test("processFile embeds favicon in HTML fixture", async () => {
    const result = await processFile(resolve(FIXTURES, "favicon.html"));
    expect(result).toContain("data:image/png;base64,");
  });
});

// ============================================================
// Feature 9: Verbose warnings
// ============================================================
describe("verbose warnings", () => {
  test("getEmbedWarnings returns warnings for missing files", async () => {
    clearEmbedWarnings();
    const html = '<img src="nonexistent.png">';
    await embedResources(html, FIXTURES, { verbose: true });
    const warns = getEmbedWarnings();
    expect(warns.length).toBeGreaterThan(0);
    expect(warns[0]).toContain("Not found");
  });

  test("no warnings when verbose is false", async () => {
    clearEmbedWarnings();
    const html = '<img src="nonexistent.png">';
    await embedResources(html, FIXTURES, { verbose: false });
    const warns = getEmbedWarnings();
    expect(warns.length).toBe(0);
  });

  test("parseArgs recognizes --verbose flag", () => {
    const args = parseArgs(["bun", "script.ts", "input.md", "--verbose"]);
    expect(args.verbose).toBe(true);
  });
});

// ============================================================
// Feature 10: Track subtitle embedding
// ============================================================
describe("track embedding", () => {
  test("embeds track src as data URI", async () => {
    const html = '<video><track src="subs.vtt" kind="subtitles"></video>';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("data:");
    expect(result).not.toContain('src="subs.vtt"');
  });

  test("leaves remote track URLs untouched", async () => {
    const html = '<video><track src="https://example.com/subs.vtt"></video>';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("https://example.com/subs.vtt");
  });
});

// ============================================================
// Feature 11: Source map stripping
// ============================================================
describe("source map stripping", () => {
  test("minifyHtml strips CSS source map comments", () => {
    const html = "<style>body{color:red}\n/*# sourceMappingURL=style.css.map */</style>";
    const result = minifyHtml(html);
    expect(result).not.toContain("sourceMappingURL");
    expect(result).toContain("color:red");
  });

  test("minifyHtml strips JS source map comments", () => {
    const html = "<script>var x=1;\n//# sourceMappingURL=app.js.map</script>";
    const result = minifyHtml(html);
    expect(result).not.toContain("sourceMappingURL");
    expect(result).toContain("var x=1");
  });

  test("minifyHtml strips inline JS source map references", () => {
    const html = "<script>var a=1;\n//# sourceMappingURL=data:application/json;base64,eyJ2ZXJz</script>";
    const result = minifyHtml(html);
    expect(result).not.toContain("sourceMappingURL");
  });
});

// ============================================================
// Feature 12: File size limit
// ============================================================
describe("file size limit", () => {
  test("maxSize skips large files", async () => {
    clearEmbedWarnings();
    const html = '<img src="pixel.png">';
    // pixel.png is likely > 1 byte, set maxSize to 1 to skip
    const result = await embedResources(html, FIXTURES, { maxSize: 1, verbose: true });
    expect(result).toContain('src="pixel.png"'); // not embedded
    const warns = getEmbedWarnings();
    expect(warns.some(w => w.includes("Skipped"))).toBe(true);
  });

  test("maxSize allows small files", async () => {
    const html = '<img src="pixel.png">';
    // 100KB limit should be enough for a small pixel.png
    const result = await embedResources(html, FIXTURES, { maxSize: 100000 });
    expect(result).toContain("data:image/png;base64,");
  });

  test("parseArgs recognizes --max-size flag", () => {
    const args = parseArgs(["bun", "script.ts", "input.md", "--max-size", "50000"]);
    expect(args.maxSize).toBe(50000);
  });
});

// ============================================================
// Feature 13: CLI flag parsing for template and toc
// ============================================================
describe("CLI new flags", () => {
  test("parseArgs recognizes -t flag", () => {
    const args = parseArgs(["bun", "script.ts", "input.md", "-t", "tpl.html"]);
    expect(args.template).toBe("tpl.html");
  });

  test("parseArgs recognizes --template flag", () => {
    const args = parseArgs(["bun", "script.ts", "input.md", "--template", "tpl.html"]);
    expect(args.template).toBe("tpl.html");
  });

  test("parseArgs recognizes --toc flag", () => {
    const args = parseArgs(["bun", "script.ts", "input.md", "--toc"]);
    expect(args.toc).toBe(true);
  });

  test("parseArgs defaults new flags to off", () => {
    const args = parseArgs(["bun", "script.ts", "input.md"]);
    expect(args.template).toBeNull();
    expect(args.toc).toBe(false);
    expect(args.watch).toBe(false);
    expect(args.verbose).toBe(false);
    expect(args.maxSize).toBeNull();
  });
});

// ============================================================
// Feature 14: TypeScript transpilation in script tags
// ============================================================
describe("TypeScript transpilation", () => {
  test("transpiles .ts script src to JavaScript", async () => {
    const html = '<html><body><script src="app.ts"></script></body></html>';
    const result = await embedResources(html, FIXTURES);
    // Type annotations should be stripped
    expect(result).not.toContain(": string");
    expect(result).not.toContain(": number");
    // But the runtime code should remain
    expect(result).toContain("Hello from TypeScript");
    expect(result).toContain("add");
    // Should be inlined, not a src reference
    expect(result).not.toContain('src="app.ts"');
  });

  test("strips type=text/typescript attribute after transpilation", async () => {
    const html = '<script type="text/typescript" src="app.ts"></script>';
    const result = await embedResources(html, FIXTURES);
    expect(result).not.toContain("text/typescript");
    expect(result).toContain("<script>");
  });

  test("leaves .js scripts untouched (no transpilation)", async () => {
    const html = '<html><body><script src="app.js"></script></body></html>';
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("Hello from app.js");
  });

  test("full pipeline: HTML with TypeScript script", async () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>TS Test</title></head>
<body>
<script type="text/typescript" src="app.ts"></script>
</body>
</html>`;
    const result = await embedResources(html, FIXTURES);
    expect(result).toContain("<script>");
    expect(result).not.toContain(": string");
    expect(result).not.toContain("text/typescript");
    expect(result).toContain("Hello from TypeScript");
  });
});
