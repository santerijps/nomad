# Nomad - Static Site Generator for Truly Portable Sites

Nomad is a static site generator with an emphasis on generating truly portable sites. What does "true portability" mean? It means the following:

- Output consists purely of HTML files
- All resources (CSS, JS, images, video, audio, PDFs etc.) are embedded directly into the HTML documents
- This ensures that you can share HTML files that just work
- The trade off is that the HTML files will be larger

Nomad is a CLI app that can be used to convert individual files (MD, HTML) into HTML or entire recursively. Nomad can also be used to convert existing HTML/JS/CSS projects into truly portable sites.

## Outline

- Allowed input file types: .html and .md
- Output file types: .html
- HTML file embedding support: video, audio, image, PDF, text
    - Use base64 encoded data blobs when possible
- Processing flow:
    1. Markdown files are converted to HTML
    2. HTML files are analyzed for embedding possibilites
        - If embeddable content is found, the content is embedded into the HTML files
- Custom Markdown to HTML renderer that makes it possible to explicitly embed files
    - E.g. embed raw text file in place
    - The raw text embed can be used for including "components"

## Command-line interface

```sh
nomad input.html # outputs to stdout
nomad input.html -o output.html # outputs to output.html
nomad input.md # outputs to stdout
nomad input.md -o output.html # outputs to output.html

nomad inputDirectory # creates a dir called "out" and writes output to files there
nomad inputDirectory -o outputDirectory # same as above but writes output to specifiec dir
```
