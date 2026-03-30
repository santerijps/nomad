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
- **Resource embedding** — Automatically inlines images, stylesheets, scripts, video, audio, PDFs, fonts, favicons, `srcset`/`<picture>`, `<track>` subtitles, and inline `style=""` URL references as base64 data URIs
- **File includes** — Use `{{embed:path/to/file}}` in Markdown to include raw text, HTML components, or any snippet
- **Directory processing** — Recursively convert an entire folder of `.md` and `.html` files in one command, with auto-generated index page
- **HTML minification** — Optionally strip comments, collapse whitespace, compress inline CSS/JS, and remove source maps with `--minify`
- **Custom templates** — Use `--template` to wrap your content in a custom HTML layout with `{{content}}`, `{{title}}`, and frontmatter variables
- **Frontmatter metadata** — YAML frontmatter in Markdown is parsed and applied as `<meta>` tags and template variables
- **Table of contents** — Auto-generate a `<nav class="toc">` from headings with `--toc`
- **Syntax highlighting** — Code blocks with language annotations get inline syntax highlighting (no external CSS/JS required)
- **Watch mode** — Rebuild automatically on file changes with `--watch`
- **Verbose diagnostics** — See warnings for skipped or missing resources with `--verbose`
- **File size limits** — Skip embedding files larger than a threshold with `--max-size`
- **Cross-platform** — Prebuilt executables for Linux, macOS, and Windows (x64 & ARM64) — no runtime required
- **Remote page capture** — Download any web page by URL and embed all its resources into a single portable file

## Installation

### Download a prebuilt binary

Grab the latest release for your platform from the [Releases](https://github.com/user/nomad/releases) page:

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
# Produce minified output (smaller file size, source maps stripped)
nomad document.md -o document.html --minify

# Short flag works too
nomad document.md -o document.html -m
```

### Custom templates

Wrap your content in a custom HTML layout. The template can use `{{content}}` for the rendered body, `{{title}}` for the page title, and any frontmatter key like `{{author}}`:

```html
<!-- template.html -->
<!DOCTYPE html>
<html>
<head><title>{{title}} - My Site</title></head>
<body>
<header>By {{author}}</header>
<main>{{content}}</main>
</body>
</html>
```

```sh
nomad document.md -o page.html --template template.html
```

### Frontmatter

Add YAML frontmatter to your Markdown files. The metadata is used for `<meta>` tags and template variables:

```md
---
title: My Page
author: Jane Doe
description: A detailed guide
---

# My Page

Content goes here.
```

### Table of contents

Auto-generate a navigable table of contents from your document's headings:

```sh
nomad document.md -o page.html --toc
```

### Watch mode

Automatically rebuild when source files change:

```sh
nomad my-site/ -o dist/ --watch
```

### Verbose mode

See warnings for resources that couldn't be found or were skipped:

```sh
nomad page.html -o out.html --verbose
```

### File size limits

Skip embedding files over a certain size to keep output manageable:

```sh
# Skip files larger than 500KB
nomad page.html -o out.html --max-size 500000
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

| Option              | Description                                       |
| ------------------- | ------------------------------------------------- |
| `<input>`           | Input file (`.md`, `.html`), directory, or URL    |
| `-o, --output`      | Output file or directory                          |
| `-m, --minify`      | Minify and compress the output HTML               |
| `-t, --template`    | HTML template file with `{{content}}`, `{{title}}`|
| `--toc`             | Generate a table of contents from headings        |
| `-w, --watch`       | Watch for file changes and auto-rebuild           |
| `--verbose`         | Show warnings for skipped/failed resources        |
| `--max-size <n>`    | Max file size in bytes to embed (skip larger)     |
| `-h, --help`        | Show help                                         |
| `-v, --version`     | Show version                                      |

## How it works

1. **Markdown files** are parsed for YAML frontmatter, then converted to HTML using Bun's built-in CommonMark/GFM renderer
2. **`{{embed:...}}` directives** are resolved and inlined before conversion
3. **Syntax highlighting** is applied to fenced code blocks with language annotations
4. **Table of contents** (optional) is generated from heading IDs and prepended to the body
5. **Templates** (optional) wrap the body in a custom HTML layout with variable substitution
6. **HTML files** are scanned for local resource references:
   - `<img src="...">` and `<img srcset="...">` → embedded as `data:image/...;base64,...`
   - `<link rel="stylesheet" href="...">` → replaced with inline `<style>` (CSS `url()` references are also embedded)
   - `<link rel="icon" href="...">` → favicon embedded as data URI
   - `<script src="...">` → replaced with inline `<script>`
   - `<video>`, `<audio>`, `<embed>`, `<object>`, `<iframe>` → embedded as data URIs
   - `<track src="...">` → subtitle/caption files embedded as data URIs
   - `style="...url(...)..."` → inline style URL references embedded
7. **Minification** (optional) strips comments, collapses whitespace, compresses inline CSS/JS, and removes source map references
8. The result is a **single self-contained HTML file** with zero external dependencies
9. **Remote URLs** are fetched directly — the same embedding pipeline applies to all linked resources on the page
10. **Directory builds** auto-generate an `index.html` listing all pages

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
