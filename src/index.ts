import { resolve, join, relative, extname, dirname, basename } from "node:path";
import { readdir, stat, mkdir, watch as fsWatch } from "node:fs/promises";
import { parseArgs } from "./cli.ts";
import { processFile, type ProcessFileOptions } from "./processor.ts";
import { minifyHtml } from "./minifier.ts";
import { ALLOWED_INPUT_EXTENSIONS, type CliArgs } from "./types.ts";
import { isUrl, fetchAndEmbed } from "./fetcher.ts";
import { getEmbedWarnings } from "./embedder.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (isUrl(args.input)) {
    await handleUrl(args.input, args.output, args.minify);
    return;
  }

  const inputPath = resolve(args.input);

  const inputStat = await stat(inputPath).catch(() => null);
  if (!inputStat) {
    console.error(`Error: "${args.input}" does not exist.`);
    process.exit(1);
  }

  if (inputStat.isFile()) {
    await handleFile(inputPath, args);
  } else if (inputStat.isDirectory()) {
    await handleDirectory(inputPath, args);
  } else {
    console.error(`Error: "${args.input}" is not a file or directory.`);
    process.exit(1);
  }

  // Watch mode
  if (args.watch) {
    if (!args.output) {
      console.error("Error: Watch mode requires -o/--output.");
      process.exit(1);
    }
    console.error("\nWatching for changes... (Ctrl+C to stop)");
    await watchAndRebuild(inputPath, args);
  }
}

async function handleUrl(url: string, output: string | null, minify: boolean): Promise<void> {
  console.error(`Fetching: ${url}`);
  let html = await fetchAndEmbed(url);
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

function getProcessOptions(args: CliArgs): ProcessFileOptions {
  return {
    template: args.template,
    toc: args.toc,
    verbose: args.verbose,
    maxSize: args.maxSize,
  };
}

async function handleFile(inputPath: string, args: CliArgs): Promise<void> {
  const ext = extname(inputPath).toLowerCase();
  if (!ALLOWED_INPUT_EXTENSIONS.includes(ext)) {
    console.error(`Error: Unsupported file type "${ext}". Supported: ${ALLOWED_INPUT_EXTENSIONS.join(", ")}`);
    process.exit(1);
  }

  let html = await processFile(inputPath, getProcessOptions(args));
  if (args.minify) html = minifyHtml(html);

  if (args.verbose) {
    const warns = getEmbedWarnings();
    for (const w of warns) console.error(`  Warning: ${w}`);
  }

  if (args.output) {
    const outputPath = resolve(args.output);
    const outputDir = dirname(outputPath);
    await mkdir(outputDir, { recursive: true });
    await Bun.write(outputPath, html);
    console.error(`Written: ${outputPath}`);
  } else {
    process.stdout.write(html);
  }
}

async function handleDirectory(inputDir: string, args: CliArgs): Promise<void> {
  const outputDir = resolve(args.output ?? "out");
  await mkdir(outputDir, { recursive: true });

  const files = await collectInputFiles(inputDir);

  if (files.length === 0) {
    console.error(`No .md or .html files found in "${inputDir}".`);
    process.exit(1);
  }

  let processed = 0;
  const processOpts = getProcessOptions(args);

  for (const filePath of files) {
    const relPath = relative(inputDir, filePath);
    const outRelPath = relPath.replace(/\.md$/i, ".html");
    const outPath = join(outputDir, outRelPath);

    await mkdir(dirname(outPath), { recursive: true });

    let html = await processFile(filePath, processOpts);
    if (args.minify) html = minifyHtml(html);
    await Bun.write(outPath, html);
    processed++;
    console.error(`[${processed}/${files.length}] ${relPath} -> ${outRelPath}`);

    if (args.verbose) {
      const warns = getEmbedWarnings();
      for (const w of warns) console.error(`  Warning: ${w}`);
    }
  }

  // Generate multi-page index
  await generateDirectoryIndex(files, inputDir, outputDir, args);

  console.error(`\nDone. Processed ${processed} file(s) -> ${outputDir}`);
}

/**
 * Generates an index.html listing all processed pages in a directory build.
 */
async function generateDirectoryIndex(
  files: string[],
  inputDir: string,
  outputDir: string,
  args: CliArgs,
): Promise<void> {
  const indexPath = join(outputDir, "index.html");
  // Don't overwrite a user-created index.html
  const indexExists = await Bun.file(indexPath).exists();

  // Check if any input file would produce index.html
  const hasExplicitIndex = files.some(f => {
    const rel = relative(inputDir, f).replace(/\.md$/i, ".html");
    return rel === "index.html";
  });

  if (hasExplicitIndex || indexExists) return;

  const links = files
    .map(f => {
      const rel = relative(inputDir, f).replace(/\.md$/i, ".html");
      const name = basename(rel, ".html");
      return `  <li><a href="${rel}">${name}</a></li>`;
    })
    .join("\n");

  const dirName = basename(inputDir);
  let indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${dirName} - Index</title>
</head>
<body>
<h1>${dirName}</h1>
<ul>
${links}
</ul>
</body>
</html>`;

  if (args.minify) indexHtml = minifyHtml(indexHtml);
  await Bun.write(indexPath, indexHtml);
  console.error(`Generated index: index.html`);
}

async function watchAndRebuild(inputPath: string, args: CliArgs): Promise<void> {
  const inputStat2 = await stat(inputPath);
  const isDir = inputStat2.isDirectory();
  const watchDir = isDir ? inputPath : dirname(inputPath);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const rebuild = async () => {
    try {
      console.error(`\nRebuilding...`);
      if (isDir) {
        await handleDirectory(inputPath, args);
      } else {
        await handleFile(inputPath, args);
      }
    } catch (e: unknown) {
      console.error(`Rebuild error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const watcher = fsWatch(watchDir, { recursive: true });
  for await (const event of watcher) {
    const ext = extname(event.filename ?? "").toLowerCase();
    if (!ALLOWED_INPUT_EXTENSIONS.includes(ext) && ![".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
      continue;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(rebuild, 200);
  }
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
