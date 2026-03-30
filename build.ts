/**
 * Cross-platform build script for Nomad SSG.
 * Compiles the CLI into standalone executables for Linux, macOS, and Windows.
 */

const targets = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
  "bun-windows-x64",
  "bun-windows-arm64",
] as const;

async function build(): Promise<void> {
  const outDir = "./dist";

  for (const target of targets) {
    const isWindows = target.includes("windows");
    const outfile = `${outDir}/nomad-${target.replace("bun-", "")}${isWindows ? ".exe" : ""}`;

    console.log(`Building ${target} -> ${outfile}`);

    const result = await Bun.build({
      entrypoints: ["./src/index.ts"],
      compile: {
        target,
        outfile,
      },
      minify: true,
    });

    if (!result.success) {
      console.error(`  Failed to build ${target}:`, result.logs);
    } else {
      console.log(`  Done: ${outfile}`);
    }
  }

  console.log("\nAll builds complete.");
}

build();
