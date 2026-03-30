import type { CliArgs } from "./types.ts";

const USAGE = `
Nomad - Static Site Generator for Truly Portable Sites

Usage:
  nomad <input>                    Process file/directory, output to stdout
  nomad <input> -o <output>        Process file/directory, output to file/directory

Arguments:
  <input>                          Input file (.md, .html) or directory
  -o, --output <path>              Output file or directory
  -m, --minify                     Minify and compress the output HTML

Examples:
  nomad input.html                 Convert HTML, output to stdout
  nomad input.html -o output.html  Convert HTML, write to output.html
  nomad input.md                   Convert Markdown, output to stdout
  nomad input.md -o output.html    Convert Markdown, write to output.html
  nomad inputDir                   Process directory, output to ./out
  nomad inputDir -o outputDir      Process directory, output to outputDir
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
  let minify = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "-o" || arg === "--output") {
      output = args[i + 1] ?? null;
      if (!output) {
        console.error("Error: -o/--output flag requires a path argument.");
        process.exit(1);
      }
      i++;
    } else if (arg === "-m" || arg === "--minify") {
      minify = true;
    } else if (!input) {
      input = arg;
    }
  }

  if (!input) {
    console.error("Error: No input file or directory specified.");
    console.log(USAGE);
    process.exit(1);
  }

  return { input, output, minify };
}
