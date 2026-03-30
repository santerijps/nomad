export interface CliArgs {
  readonly input: string;
  readonly output: string | null;
  readonly minify: boolean;
  readonly template: string | null;
  readonly toc: boolean;
  readonly watch: boolean;
  readonly verbose: boolean;
  readonly maxSize: number | null;
}

export interface FrontmatterResult {
  readonly content: string;
  readonly metadata: Record<string, string>;
}

export interface ProcessOptions {
  /** Base directory for resolving relative paths in embeds */
  readonly baseDir: string;
}

export type InputFileType = ".md" | ".html";

export const ALLOWED_INPUT_EXTENSIONS: readonly string[] = [".md", ".html", ".htm"];
