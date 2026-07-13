import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
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

async function pdfRuntimePrototypes(bytes: Uint8Array) {
  const loadingTask = getDocument({ data: new Uint8Array(bytes) });
  const document = await loadingTask.promise;
  const page = await document.getPage(1);
  const canvas = createCanvas(1, 1);
  const prototypes = {
    canvas: Object.getPrototypeOf(canvas) as object,
    document: Object.getPrototypeOf(document) as object,
    loadingTask: Object.getPrototypeOf(loadingTask) as object,
    page: Object.getPrototypeOf(page) as object,
  };
  canvas.width = 0;
  canvas.height = 0;
  page.cleanup();
  await loadingTask.destroy();
  return prototypes;
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

test("interrupting PDF rendering cancels and releases every owned resource", async () => {
  const directory = await temporaryDirectory("unslide interrupted pdf inspection ");
  const inputHtml = resolve(directory, "report.html");
  const inputPdf = resolve(directory, "report.pdf");
  const outputDirectory = resolve(directory, "pdf pages");
  await writeFile(inputHtml, fixtureHtml());
  await exportHtmlPdf(inputHtml, inputPdf);
  await mkdir(outputDirectory);
  await writeFile(resolve(outputDirectory, "page-01.png"), "prior inspection");

  const prototypes = await pdfRuntimePrototypes(await readFile(inputPdf));
  const loadingTaskPrototype = prototypes.loadingTask as { destroy: () => Promise<void> };
  const pagePrototype = prototypes.page as { cleanup: () => boolean; render: (...args: unknown[]) => unknown };
  const originalDestroy = loadingTaskPrototype.destroy;
  const originalCleanup = pagePrototype.cleanup;
  const originalRender = pagePrototype.render;
  const width = Object.getOwnPropertyDescriptor(prototypes.canvas, "width");
  const height = Object.getOwnPropertyDescriptor(prototypes.canvas, "height");
  assert.ok(width?.get && width.set && height?.get && height.set);

  let destroyCalls = 0;
  let cleanupCalls = 0;
  let cancelCalls = 0;
  let zeroWidth = 0;
  let zeroHeight = 0;
  let startRender: (() => void) | undefined;
  const renderStarted = new Promise<void>((resolveStarted) => {
    startRender = resolveStarted;
  });
  const controller = new AbortController();
  try {
    loadingTaskPrototype.destroy = async function() {
      destroyCalls += 1;
      await originalDestroy.call(this);
    };
    pagePrototype.cleanup = function() {
      cleanupCalls += 1;
      return originalCleanup.call(this);
    };
    pagePrototype.render = function() {
      startRender?.();
      return {
        cancel() {
          cancelCalls += 1;
        },
        promise: new Promise<void>(() => {}),
      };
    };
    Object.defineProperty(prototypes.canvas, "width", {
      ...width,
      set(value: number) {
        if (value === 0) zeroWidth += 1;
        width.set?.call(this, value);
      },
    });
    Object.defineProperty(prototypes.canvas, "height", {
      ...height,
      set(value: number) {
        if (value === 0) zeroHeight += 1;
        height.set?.call(this, value);
      },
    });

    const pending = inspectPdfPages(inputPdf, outputDirectory, { signal: controller.signal });
    await renderStarted;
    controller.abort();
    await assert.rejects(pending, /Operation interrupted/);
    assert.deepEqual({ cancelCalls, cleanupCalls, destroyCalls, zeroHeight, zeroWidth }, {
      cancelCalls: 1,
      cleanupCalls: 1,
      destroyCalls: 1,
      zeroHeight: 1,
      zeroWidth: 1,
    });
    assert.equal(await readFile(resolve(outputDirectory, "page-01.png"), "utf8"), "prior inspection");
    assert.equal((await readdir(outputDirectory)).some((name) => name.startsWith(".unslide-page-images-")), false);
  } finally {
    loadingTaskPrototype.destroy = originalDestroy;
    pagePrototype.cleanup = originalCleanup;
    pagePrototype.render = originalRender;
    Object.defineProperty(prototypes.canvas, "width", width);
    Object.defineProperty(prototypes.canvas, "height", height);
    await rm(directory, { recursive: true, force: true });
  }
});

test("interrupting PDF page acquisition destroys its loading task exactly once", async () => {
  const directory = await temporaryDirectory("unslide interrupted PDF page load ");
  const inputHtml = resolve(directory, "report.html");
  const inputPdf = resolve(directory, "report.pdf");
  const outputDirectory = resolve(directory, "pdf pages");
  await writeFile(inputHtml, fixtureHtml());
  await exportHtmlPdf(inputHtml, inputPdf);
  await mkdir(outputDirectory);
  await writeFile(resolve(outputDirectory, "page-01.png"), "prior inspection");

  const prototypes = await pdfRuntimePrototypes(await readFile(inputPdf));
  const documentPrototype = prototypes.document as { getPage: (index: number) => Promise<unknown> };
  const loadingTaskPrototype = prototypes.loadingTask as { destroy: () => Promise<void> };
  const originalGetPage = documentPrototype.getPage;
  const originalDestroy = loadingTaskPrototype.destroy;
  let destroyCalls = 0;
  let startPageLoad: (() => void) | undefined;
  const pageLoadStarted = new Promise<void>((resolveStarted) => {
    startPageLoad = resolveStarted;
  });
  const controller = new AbortController();
  try {
    documentPrototype.getPage = async function() {
      startPageLoad?.();
      return new Promise<never>(() => {});
    };
    loadingTaskPrototype.destroy = async function() {
      destroyCalls += 1;
      await originalDestroy.call(this);
    };

    const pending = inspectPdfPages(inputPdf, outputDirectory, { signal: controller.signal });
    await pageLoadStarted;
    controller.abort();
    await assert.rejects(pending, /Operation interrupted/);
    assert.equal(destroyCalls, 1);
    assert.equal(await readFile(resolve(outputDirectory, "page-01.png"), "utf8"), "prior inspection");
    assert.equal((await readdir(outputDirectory)).some((name) => name.startsWith(".unslide-page-images-")), false);
  } finally {
    documentPrototype.getPage = originalGetPage;
    loadingTaskPrototype.destroy = originalDestroy;
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF inspection retains render and cleanup failures without replacing prior images", async () => {
  const directory = await temporaryDirectory("unslide failed pdf cleanup ");
  const inputHtml = resolve(directory, "report.html");
  const inputPdf = resolve(directory, "report.pdf");
  const outputDirectory = resolve(directory, "pdf pages");
  await writeFile(inputHtml, fixtureHtml());
  await exportHtmlPdf(inputHtml, inputPdf);
  await mkdir(outputDirectory);
  await writeFile(resolve(outputDirectory, "page-01.png"), "prior inspection");

  const prototypes = await pdfRuntimePrototypes(await readFile(inputPdf));
  const pagePrototype = prototypes.page as { cleanup: () => boolean; render: (...args: unknown[]) => unknown };
  const originalCleanup = pagePrototype.cleanup;
  const originalRender = pagePrototype.render;
  try {
    pagePrototype.cleanup = function() {
      originalCleanup.call(this);
      throw new Error("fixture PDF page cleanup failed");
    };
    pagePrototype.render = function() {
      return {
        cancel() {},
        promise: Promise.reject(new Error("fixture PDF render failed")),
      };
    };

    await assert.rejects(
      inspectPdfPages(inputPdf, outputDirectory),
      /fixture PDF render failed[\s\S]*Cleanup failed: fixture PDF page cleanup failed/,
    );
    assert.equal(await readFile(resolve(outputDirectory, "page-01.png"), "utf8"), "prior inspection");
    assert.equal((await readdir(outputDirectory)).some((name) => name.startsWith(".unslide-page-images-")), false);
  } finally {
    pagePrototype.cleanup = originalCleanup;
    pagePrototype.render = originalRender;
    await rm(directory, { recursive: true, force: true });
  }
});
