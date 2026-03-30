import type { CliArgs } from "./types.ts";

const USAGE = `
Nomad - Static Site Generator for Truly Portable Sites

Usage:
  nomad <input>                    Process file/directory, output to stdout
  nomad <input> -o <output>        Process file/directory, output to file/directory
  nomad <url> -o <output>          Download remote page and make it portable

Arguments:
  <input>                          Input file (.md, .html), directory, or URL
  -o, --output <path>              Output file or directory
  -m, --minify                     Minify and compress the output HTML
  -t, --template <file>            HTML template with {{content}}, {{title}}, etc.
  --toc                            Generate a table of contents from headings
  -w, --watch                      Watch for file changes and rebuild
  --verbose                        Show warnings for skipped/failed resources
  --max-size <bytes>               Max file size in bytes to embed (skip larger)

Examples:
  nomad input.md                   Convert Markdown, output to stdout
  nomad input.md -o output.html    Convert Markdown, write to output.html
  nomad input.md --toc             Include table of contents
  nomad input.md -t template.html  Use custom HTML template
  nomad inputDir -o dist/          Process directory, output to dist/
  nomad https://example.com -o page.html  Download & embed remote page
  nomad inputDir -w -o dist/       Watch mode with auto-rebuild
`.trim();

export function parseArgs(argv: string[]): CliArgs {
  // Skip bun and script path
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log("nomad 1.0.0");
    process.exit(0);
  }

  let input: string | null = null;
  let output: string | null = null;
  let template: string | null = null;
  let minify = false;
  let toc = false;
  let watch = false;
  let verbose = false;
  let maxSize: number | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "-o" || arg === "--output") {
      output = args[i + 1] ?? null;
      if (!output) {
        console.error("Error: -o/--output flag requires a path argument.");
        process.exit(1);
      }
      i++;
    } else if (arg === "-t" || arg === "--template") {
      template = args[i + 1] ?? null;
      if (!template) {
        console.error("Error: -t/--template flag requires a file path argument.");
        process.exit(1);
      }
      i++;
    } else if (arg === "--max-size") {
      const raw = args[i + 1] ?? null;
      if (!raw) {
        console.error("Error: --max-size flag requires a numeric argument.");
        process.exit(1);
      }
      maxSize = parseInt(raw, 10);
      if (isNaN(maxSize) || maxSize <= 0) {
        console.error("Error: --max-size must be a positive integer.");
        process.exit(1);
      }
      i++;
    } else if (arg === "-m" || arg === "--minify") {
      minify = true;
    } else if (arg === "--toc") {
      toc = true;
    } else if (arg === "-w" || arg === "--watch") {
      watch = true;
    } else if (arg === "--verbose") {
      verbose = true;
    } else if (!input) {
      input = arg;
    }
  }

  if (!input) {
    console.error("Error: No input file or directory specified.");
    console.log(USAGE);
    process.exit(1);
  }

  return { input, output, minify, template, toc, watch, verbose, maxSize };
}
