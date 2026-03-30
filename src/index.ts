import { resolve, join, relative, extname, dirname } from "node:path";
import { readdir, stat, mkdir } from "node:fs/promises";
import { parseArgs } from "./cli.ts";
import { processFile } from "./processor.ts";
import { minifyHtml } from "./minifier.ts";
import { ALLOWED_INPUT_EXTENSIONS } from "./types.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const inputPath = resolve(args.input);

  const inputStat = await stat(inputPath).catch(() => null);
  if (!inputStat) {
    console.error(`Error: "${args.input}" does not exist.`);
    process.exit(1);
  }

  if (inputStat.isFile()) {
    await handleFile(inputPath, args.output, args.minify);
  } else if (inputStat.isDirectory()) {
    await handleDirectory(inputPath, args.output, args.minify);
  } else {
    console.error(`Error: "${args.input}" is not a file or directory.`);
    process.exit(1);
  }
}

async function handleFile(inputPath: string, output: string | null, minify: boolean): Promise<void> {
  const ext = extname(inputPath).toLowerCase();
  if (!ALLOWED_INPUT_EXTENSIONS.includes(ext)) {
    console.error(`Error: Unsupported file type "${ext}". Supported: ${ALLOWED_INPUT_EXTENSIONS.join(", ")}`);
    process.exit(1);
  }

  let html = await processFile(inputPath);
  if (minify) html = minifyHtml(html);

  if (output) {
    const outputPath = resolve(output);
    const outputDir = dirname(outputPath);
    await mkdir(outputDir, { recursive: true });
    await Bun.write(outputPath, html);
    console.error(`Written: ${outputPath}`);
  } else {
    process.stdout.write(html);
  }
}

async function handleDirectory(inputDir: string, output: string | null, minify: boolean): Promise<void> {
  const outputDir = resolve(output ?? "out");
  await mkdir(outputDir, { recursive: true });

  const files = await collectInputFiles(inputDir);

  if (files.length === 0) {
    console.error(`No .md or .html files found in "${inputDir}".`);
    process.exit(1);
  }

  let processed = 0;
  for (const filePath of files) {
    const relPath = relative(inputDir, filePath);
    const outRelPath = relPath.replace(/\.md$/i, ".html");
    const outPath = join(outputDir, outRelPath);

    await mkdir(dirname(outPath), { recursive: true });

    let html = await processFile(filePath);
    if (minify) html = minifyHtml(html);
    await Bun.write(outPath, html);
    processed++;
    console.error(`[${processed}/${files.length}] ${relPath} -> ${outRelPath}`);
  }

  console.error(`\nDone. Processed ${processed} file(s) -> ${outputDir}`);
}

async function collectInputFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await collectInputFiles(fullPath);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (ALLOWED_INPUT_EXTENSIONS.includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
