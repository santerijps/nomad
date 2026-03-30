import { describe, expect, test } from "bun:test";
import { getMimeType, isTextMime } from "../src/mime.ts";

describe("getMimeType", () => {
  test("returns correct MIME for common image types", () => {
    expect(getMimeType("photo.png")).toBe("image/png");
    expect(getMimeType("photo.jpg")).toBe("image/jpeg");
    expect(getMimeType("photo.jpeg")).toBe("image/jpeg");
    expect(getMimeType("image.gif")).toBe("image/gif");
    expect(getMimeType("image.svg")).toBe("image/svg+xml");
    expect(getMimeType("image.webp")).toBe("image/webp");
  });

  test("returns correct MIME for video types", () => {
    expect(getMimeType("video.mp4")).toBe("video/mp4");
    expect(getMimeType("video.webm")).toBe("video/webm");
  });

  test("returns correct MIME for audio types", () => {
    expect(getMimeType("audio.mp3")).toBe("audio/mpeg");
    expect(getMimeType("audio.wav")).toBe("audio/wav");
  });

  test("returns correct MIME for documents", () => {
    expect(getMimeType("doc.pdf")).toBe("application/pdf");
    expect(getMimeType("style.css")).toBe("text/css");
    expect(getMimeType("script.js")).toBe("text/javascript");
  });

  test("returns octet-stream for unknown extensions", () => {
    expect(getMimeType("file.xyz")).toBe("application/octet-stream");
    expect(getMimeType("file.unknown")).toBe("application/octet-stream");
  });

  test("handles file extensions case-insensitively", () => {
    expect(getMimeType("IMAGE.PNG")).toBe("image/png");
    expect(getMimeType("Photo.JPG")).toBe("image/jpeg");
    expect(getMimeType("image.png")).toBe("image/png");
  });
});

describe("isTextMime", () => {
  test("identifies text MIME types", () => {
    expect(isTextMime("text/css")).toBe(true);
    expect(isTextMime("text/html")).toBe(true);
    expect(isTextMime("text/javascript")).toBe(true);
    expect(isTextMime("text/plain")).toBe(true);
    expect(isTextMime("application/json")).toBe(true);
    expect(isTextMime("application/xml")).toBe(true);
    expect(isTextMime("image/svg+xml")).toBe(true);
  });

  test("identifies non-text MIME types", () => {
    expect(isTextMime("image/png")).toBe(false);
    expect(isTextMime("video/mp4")).toBe(false);
    expect(isTextMime("application/pdf")).toBe(false);
    expect(isTextMime("application/octet-stream")).toBe(false);
  });
});
