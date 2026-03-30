import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { resolve, join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { Server } from "bun";
import { isUrl, fetchAndEmbed } from "../src/fetcher.ts";

const ROOT = resolve(import.meta.dir, "..");

// Serve test fixtures via a local HTTP server
let server: Server<undefined>;
let baseUrl: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0, // random available port
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (path === "/page.html") {
        return new Response(
          `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1>Hello Remote</h1>
  <img src="/pixel.png" alt="pixel">
  <script src="/app.js"></script>
</body>
</html>`,
          { headers: { "content-type": "text/html" } },
        );
      }

      if (path === "/style.css") {
        return new Response("body { color: red; background: url('/pixel.png'); }", {
          headers: { "content-type": "text/css" },
        });
      }

      if (path === "/app.js") {
        return new Response('console.log("hello remote");', {
          headers: { "content-type": "text/javascript" },
        });
      }

      if (path === "/pixel.png") {
        // 1x1 red PNG
        const pngBytes = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
          0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63,
          0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21,
          0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
          0x42, 0x60, 0x82,
        ]);
        return new Response(pngBytes, {
          headers: { "content-type": "image/png" },
        });
      }

      if (path === "/minimal.html") {
        return new Response(
          "<!DOCTYPE html><html><head><title>Minimal</title></head><body><p>Just text</p></body></html>",
          { headers: { "content-type": "text/html" } },
        );
      }

      return new Response("Not Found", { status: 404 });
    },
  });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

describe("isUrl", () => {
  test("detects http URLs", () => {
    expect(isUrl("http://example.com")).toBe(true);
  });

  test("detects https URLs", () => {
    expect(isUrl("https://example.com/page")).toBe(true);
  });

  test("rejects file paths", () => {
    expect(isUrl("./file.html")).toBe(false);
    expect(isUrl("/absolute/path.md")).toBe(false);
    expect(isUrl("relative.md")).toBe(false);
  });
});

describe("fetchAndEmbed", () => {
  test("fetches and returns HTML for a remote page", async () => {
    const html = await fetchAndEmbed(`${baseUrl}/page.html`);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<h1>Hello Remote</h1>");
  });

  test("embeds remote images as data URIs", async () => {
    const html = await fetchAndEmbed(`${baseUrl}/page.html`);
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain('src="/pixel.png"');
  });

  test("inlines remote stylesheets", async () => {
    const html = await fetchAndEmbed(`${baseUrl}/page.html`);
    expect(html).toContain("<style>");
    expect(html).toContain("color: red");
    expect(html).not.toContain('href="/style.css"');
  });

  test("embeds url() references within inlined CSS", async () => {
    const html = await fetchAndEmbed(`${baseUrl}/page.html`);
    // The background: url('/pixel.png') in CSS should become a data URI
    expect(html).not.toContain("url('/pixel.png')");
    expect(html).toContain("url(\"data:");
  });

  test("inlines remote scripts", async () => {
    const html = await fetchAndEmbed(`${baseUrl}/page.html`);
    expect(html).toContain('console.log("hello remote")');
    expect(html).not.toContain('src="/app.js"');
  });

  test("handles a minimal page with no resources", async () => {
    const html = await fetchAndEmbed(`${baseUrl}/minimal.html`);
    expect(html).toContain("<p>Just text</p>");
    expect(html).toContain("<title>Minimal</title>");
  });

  test("throws for non-existent URL", async () => {
    await expect(fetchAndEmbed(`${baseUrl}/nonexistent`)).rejects.toThrow("Failed to fetch");
  });
});

describe("CLI integration with URL", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "nomad-url-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterAll(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("downloads URL and writes to file with -o", async () => {
    const tmpDir = await makeTempDir();
    const outFile = join(tmpDir, "output.html");

    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", `${baseUrl}/page.html`, "-o", outFile],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
    );
    await proc.exited;
    expect(proc.exitCode).toBe(0);

    const content = await readFile(outFile, "utf-8");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("data:image/png;base64,");
    expect(content).toContain("<style>");
    expect(content).toContain('console.log("hello remote")');
  });

  test("downloads URL and outputs to stdout", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", `${baseUrl}/minimal.html`],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
    );
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain("<p>Just text</p>");
  });

  test("downloads URL with --minify flag", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", `${baseUrl}/page.html`, "--minify"],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
    );
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain("<h1>Hello Remote</h1>");
    // Should be minified — no multi-line whitespace runs outside script/style
    expect(stdout).not.toMatch(/>\s{2,}</);
  });

  test("help text mentions URL usage", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "--help"],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
    );
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(stdout).toContain("https://example.com");
  });
});
