# Nomad

**The static site generator that produces truly portable HTML files.**

Nomad takes your Markdown or HTML files and produces self-contained HTML documents where every resource — CSS, JavaScript, images, video, audio, PDFs, fonts — is embedded directly into the file. No external dependencies, no broken links, no missing assets. Just a single `.html` file you can open anywhere.

## Why Nomad?

Ever tried sharing an HTML page only to find the images are missing, the styles are gone, or the scripts won't load? Nomad solves this by baking everything into one file.

**Perfect for:**

- 📄 **Documentation** — Ship a single HTML file that works offline, on any device
- 📧 **Email-friendly reports** — Attach a self-contained HTML report with charts, images, and styling intact
- 📝 **Markdown publishing** — Write in Markdown, distribute as a polished HTML page
- 🗂️ **Archiving websites** — Freeze a project's pages into portable snapshots
- 🌐 **Saving web pages** — Download any URL and capture it as a self-contained offline HTML file
- 🧩 **Prototyping** — Convert multi-file HTML/CSS/JS projects into single-file demos
- 🎓 **Teaching materials** — Create handouts and tutorials that just work when opened

## Features

- **Markdown → HTML** — Converts `.md` files using a fast built-in GFM-compliant renderer (tables, task lists, strikethrough, heading IDs, autolinks)
- **Resource embedding** — Automatically inlines images, stylesheets, scripts, video, audio, PDFs, and fonts as base64 data URIs
- **File includes** — Use `{{embed:path/to/file}}` in Markdown to include raw text, HTML components, or any snippet
- **Directory processing** — Recursively convert an entire folder of `.md` and `.html` files in one command
- **HTML minification** — Optionally strip comments, collapse whitespace, and compress inline CSS/JS with `--minify`
- **Cross-platform** — Prebuilt executables for Linux, macOS, and Windows (x64 & ARM64) — no runtime required
- **Remote page capture** — Download any web page by URL and embed all its resources into a single portable file

## Installation

### Download a prebuilt binary

Grab the latest release for your platform from the [Releases](https://github.com/user/nomad-ssg/releases) page:

| Platform         | Binary                       |
| ---------------- | ---------------------------- |
| Linux x64        | `nomad-linux-x64`            |
| Linux ARM64      | `nomad-linux-arm64`          |
| macOS x64        | `nomad-darwin-x64`           |
| macOS ARM64      | `nomad-darwin-arm64`         |
| Windows x64      | `nomad-windows-x64.exe`      |
| Windows ARM64    | `nomad-windows-arm64.exe`    |

Place the binary somewhere on your `PATH` and you're ready to go.

### Build from source

Requires [Bun](https://bun.sh) v1.3+.

```sh
# Clone the repository
git clone https://github.com/user/nomad-ssg.git
cd nomad-ssg

# Install dependencies
bun install

# Run directly
bun run src/index.ts --help

# Build for the current platform
bun build --compile src/index.ts --outfile nomad

# Build for all platforms
bun run build
```

## Usage

### Single file

```sh
# Convert Markdown and print to stdout
nomad document.md

# Convert Markdown and write to a file
nomad document.md -o document.html

# Convert an HTML file (embeds all local resources)
nomad page.html -o portable-page.html
```

### Directory

```sh
# Process all .md and .html files recursively, output to ./out
nomad my-site/

# Process into a specific output directory
nomad my-site/ -o dist/
```

### Minification

```sh
# Produce minified output (smaller file size)
nomad document.md -o document.html --minify

# Short flag works too
nomad document.md -o document.html -m
```

### Remote URL

Download a remote web page and convert it to portable HTML with all resources embedded:

```sh
# Download a page and write to a file
nomad https://example.com -o example.html

# Download and print to stdout
nomad https://example.com

# Download and minify in one step
nomad https://example.com -o page.html --minify
```

All images, stylesheets, scripts, and CSS `url()` references on the remote page are fetched and embedded as data URIs, producing a fully self-contained HTML file.

### Embed directive

Include external files directly into your Markdown with the `{{embed:...}}` syntax. The path is resolved relative to the Markdown file.

```md
# My Page

Here is a reusable navigation bar:

{{embed:components/nav.html}}

And some content below.
```

This is useful for:

- Reusable HTML components (headers, footers, navbars)
- Including code samples from external files
- Composing pages from smaller fragments

Embeds are resolved recursively — an embedded file can itself contain `{{embed:...}}` directives.

## CLI Reference

```
nomad <input> [options]
```

| Option              | Description                                  |
| ------------------- | -------------------------------------------- |
| `<input>`           | Input file (`.md`, `.html`), directory, or URL |
| `-o, --output`      | Output file or directory                      |
| `-m, --minify`      | Minify and compress the output HTML           |
| `-h, --help`        | Show help                                     |
| `-v, --version`     | Show version                                  |

## How it works

1. **Markdown files** are converted to HTML using Bun's built-in CommonMark/GFM renderer
2. **`{{embed:...}}` directives** are resolved and inlined before conversion
3. **HTML files** are scanned for local resource references:
   - `<img src="...">` → embedded as `data:image/...;base64,...`
   - `<link rel="stylesheet" href="...">` → replaced with inline `<style>` (CSS `url()` references are also embedded)
   - `<script src="...">` → replaced with inline `<script>`
   - `<video>`, `<audio>`, `<embed>`, `<object>`, `<iframe>` → embedded as data URIs
4. **Minification** (optional) strips comments, collapses whitespace, and compresses inline CSS/JS
5. The result is a **single self-contained HTML file** with zero external dependencies
6. **Remote URLs** are fetched directly — the same embedding pipeline applies to all linked resources on the page

Remote URLs (`http://`, `https://`) in local files are left untouched — only local files are embedded. When the *input itself* is a URL, all resources on that page are fetched and embedded.

## Development

```sh
# Run the test suite
bun test

# Run a specific test file
bun test tests/embedder.test.ts
```

## License

MIT
