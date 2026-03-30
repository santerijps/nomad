export interface CliArgs {
  readonly input: string;
  readonly output: string | null;
  readonly minify: boolean;
}

export interface ProcessOptions {
  /** Base directory for resolving relative paths in embeds */
  readonly baseDir: string;
}

export type InputFileType = ".md" | ".html";

export const ALLOWED_INPUT_EXTENSIONS: readonly string[] = [".md", ".html", ".htm"];
