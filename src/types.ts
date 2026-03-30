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

export const ALLOWED_INPUT_EXTENSIONS: readonly string[] = [".md", ".html", ".htm"];
