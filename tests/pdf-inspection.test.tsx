import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { inspectPdfPages } from "../src/unslide/pdf-inspection.js";
import { exportHtmlPdf } from "../src/unslide/pdf.js";

const repositoryRoot = resolve(".");

async function temporaryDirectory(prefix: string): Promise<string> {
  await mkdir(resolve(repositoryRoot, ".tmp"), { recursive: true });
  return mkdtemp(resolve(repositoryRoot, ".tmp", prefix));
}

function fixtureHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="unslide-protocol" content="1">
    <title>PDF inspection fixture</title>
    <style>
      @page { size: 4in 3in; margin: 0 }
      * { box-sizing: border-box }
      body, h1, p { margin: 0 }
      main { width: 4in; height: 3in; padding: 0.25in; color: white; background: #173b2c; break-after: page }
      main:last-child { color: #173b2c; background: #f4f0e8; break-after: auto }
    </style>
  </head>
  <body>
    <main data-unslide-page="one"><h1>First PDF page</h1><p>Rendered from the delivery artifact.</p></main>
    <main data-unslide-page="two"><h1>Second PDF page</h1><p>No source HTML is needed.</p></main>
  </body>
</html>`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("rasterizes only the existing PDF into deterministic ordered PNG pages", async () => {
  const directory = await temporaryDirectory("unslide pdf inspection ");
  const inputHtml = resolve(directory, "report.html");
  const inputPdf = resolve(directory, "report.pdf");
  const outputDirectory = resolve(directory, "pdf pages");
  try {
    await writeFile(inputHtml, fixtureHtml());
    await exportHtmlPdf(inputHtml, inputPdf);
    await rm(inputHtml);

    const first = await inspectPdfPages(inputPdf, outputDirectory);
    assert.equal(first.pages.length, 2);
    assert.deepEqual(first.pages.map(({ index, width, height }) => ({ index, width, height })), [
      { index: 1, width: 384, height: 288 },
      { index: 2, width: 384, height: 288 },
    ]);
    const firstBytes = await Promise.all(first.pages.map((page) => readFile(page.outputPath)));
    for (const bytes of firstBytes) {
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(bytes.readUInt32BE(16), 384);
      assert.equal(bytes.readUInt32BE(20), 288);
    }

    await writeFile(resolve(outputDirectory, "page-99.png"), "stale managed image");
    await writeFile(resolve(outputDirectory, "review-notes.txt"), "keep me");
    const second = await inspectPdfPages(inputPdf, outputDirectory);
    const secondBytes = await Promise.all(second.pages.map((page) => readFile(page.outputPath)));
    assert.deepEqual(secondBytes.map(sha256), firstBytes.map(sha256));
    assert.deepEqual((await readdir(outputDirectory)).sort(), ["page-01.png", "page-02.png", "review-notes.txt"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports corrupt PDFs without replacing prior inspection images", async () => {
  const directory = await temporaryDirectory("unslide corrupt pdf inspection ");
  const inputPdf = resolve(directory, "corrupt.pdf");
  const outputDirectory = resolve(directory, "pdf pages");
  try {
    await writeFile(inputPdf, "not a PDF");
    await mkdir(outputDirectory);
    await writeFile(resolve(outputDirectory, "page-01.png"), "prior inspection");

    await assert.rejects(inspectPdfPages(inputPdf, outputDirectory), /Cannot rasterize PDF.*Invalid PDF structure/);
    assert.equal(await readFile(resolve(outputDirectory, "page-01.png"), "utf8"), "prior inspection");
    assert.equal((await readdir(outputDirectory)).some((name) => name.startsWith(".unslide-page-images-")), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
