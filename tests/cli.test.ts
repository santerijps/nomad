import { describe, expect, test, afterAll } from "bun:test";
import { resolve, join } from "node:path";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dir, "..");
const FIXTURES = resolve(import.meta.dir, "fixtures");

describe("CLI integration", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "nomad-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterAll(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("outputs HTML to stdout for a markdown file", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", resolve(FIXTURES, "sample.md")], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain("<!DOCTYPE html>");
    expect(stdout).toContain("<strong>test</strong>");
  });

  test("outputs HTML to stdout for an HTML file", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", resolve(FIXTURES, "sample.html")], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain("<!DOCTYPE html>");
    expect(stdout).toContain("<style>");
  });

  test("writes output to file with -o flag", async () => {
    const tmpDir = await makeTempDir();
    const outFile = join(tmpDir, "output.html");

    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", resolve(FIXTURES, "sample.md"), "-o", outFile],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" }
    );
    await proc.exited;
    expect(proc.exitCode).toBe(0);

    const content = await readFile(outFile, "utf-8");
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("Test Document");
  });

  test("processes a directory and creates output files", async () => {
    const tmpDir = await makeTempDir();

    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", resolve(FIXTURES, "site"), "-o", tmpDir],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" }
    );
    await proc.exited;
    expect(proc.exitCode).toBe(0);

    // Check that index.html was created
    const indexContent = await readFile(join(tmpDir, "index.html"), "utf-8");
    expect(indexContent).toContain("<!DOCTYPE html>");
    expect(indexContent).toContain("Index Page");

    // Check that sub/page.html was created
    const subContent = await readFile(join(tmpDir, "sub", "page.html"), "utf-8");
    expect(subContent).toContain("<!DOCTYPE html>");
    expect(subContent).toContain("Sub Page");
  });

  test("shows help with --help flag", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "--help"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(stdout).toContain("Nomad");
    expect(stdout).toContain("Usage:");
  });

  test("exits with error for non-existent input", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "nonexistent.md"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    expect(proc.exitCode).not.toBe(0);
  });

  test("--minify flag produces smaller output", async () => {
    const normal = Bun.spawn(["bun", "run", "src/index.ts", resolve(FIXTURES, "sample.md")], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const normalOut = await new Response(normal.stdout).text();
    await normal.exited;

    const minified = Bun.spawn(
      ["bun", "run", "src/index.ts", resolve(FIXTURES, "sample.md"), "--minify"],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const minifiedOut = await new Response(minified.stdout).text();
    await minified.exited;

    expect(minified.exitCode).toBe(0);
    expect(minifiedOut.length).toBeLessThan(normalOut.length);
    expect(minifiedOut).toContain("<strong>test</strong>");
  });

  test("-m short flag also minifies output", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", resolve(FIXTURES, "sample.md"), "-m"],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(proc.exitCode).toBe(0);
    // Minified output should not have multi-line whitespace runs
    expect(stdout).not.toMatch(/\n\s*\n/);
  });
});
