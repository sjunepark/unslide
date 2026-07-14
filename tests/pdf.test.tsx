import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { exportHtmlPdf as exportHtmlPdfEffect } from "../src/unslide/pdf.js";
import { runUnslide, type RunOptions } from "./runtime.js";

const exportHtmlPdf = (input: string, output: string, options: RunOptions = {}) =>
  runUnslide(exportHtmlPdfEffect(input, output), options);

const repositoryRoot = resolve(".");

function artifact(styles: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="unslide-protocol" content="1">
    <title>PDF export fixture</title>
    <style>${styles}</style>
  </head>
  <body>${body}</body>
</html>`;
}

async function temporaryDirectory(prefix: string): Promise<string> {
  await mkdir(resolve(repositoryRoot, ".tmp"), { recursive: true });
  return mkdtemp(resolve(repositoryRoot, ".tmp", prefix));
}

function artifactIssues(error: unknown): Array<{ code: string; resource?: string }> {
  const cause = error instanceof Error
    ? (error as Error & { cause?: { reasons?: unknown[] } }).cause
    : undefined;
  return cause?.reasons?.flatMap((reason) => {
    if (
      typeof reason !== "object"
      || reason === null
      || !("_tag" in reason)
      || reason._tag !== "Fail"
      || !("error" in reason)
      || typeof reason.error !== "object"
      || reason.error === null
      || !("issues" in reason.error)
      || !Array.isArray(reason.error.issues)
    ) return [];
    return reason.error.issues as Array<{ code: string; resource?: string }>;
  }) ?? [];
}

async function pdfRuntimePrototypes(bytes: Uint8Array) {
  const loadingTask = getDocument({ data: new Uint8Array(bytes) });
  const document = await loadingTask.promise;
  const page = await document.getPage(1);
  const prototypes = {
    document: Object.getPrototypeOf(document) as object,
    loadingTask: Object.getPrototypeOf(loadingTask) as object,
    page: Object.getPrototypeOf(page) as object,
  };
  page.cleanup();
  await loadingTask.destroy();
  return prototypes;
}

test("exports a readable text PDF with authored common geometry", async () => {
  const directory = await temporaryDirectory("unslide pdf success ");
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  try {
    await writeFile(inputPath, artifact(
      "@page{size:4in 3in;margin:0}*{box-sizing:border-box}body,h1,p{margin:0}main{width:4in;height:3in;background:#173b2c;color:white;break-after:page}main:last-child{break-after:auto}",
      '<main data-unslide-page="one"><h1>Quarterly field note</h1><p>Searchable delivery text.</p></main>',
    ));

    const result = await exportHtmlPdf(inputPath, outputPath);
    assert.equal(result.pages.length, 1);
    assert.equal(result.pages[0]?.widthPoints, 288);
    assert.equal(result.pages[0]?.heightPoints, 216);
    assert.match(result.pages[0]?.textSample ?? "", /Searchable delivery text/);
    assert.equal((await readFile(outputPath)).subarray(0, 5).toString(), "%PDF-");

    for (const [size, expectedWidth, expectedHeight] of [
      ["100mm 200mm", 100 * 72 / 25.4, 200 * 72 / 25.4],
      ["A3", 297 * 72 / 25.4, 420 * 72 / 25.4],
      ["ledger", 11 * 72, 17 * 72],
    ] as const) {
      await writeFile(inputPath, artifact(
        `@page{size:${size};margin:0}body{margin:0}`,
        '<main data-unslide-page="one">Pinned Chromium geometry</main>',
      ));
      const geometryResult = await exportHtmlPdf(inputPath, outputPath);
      assert.ok(Math.abs((geometryResult.pages[0]?.widthPoints ?? 0) - expectedWidth) <= 1);
      assert.ok(Math.abs((geometryResult.pages[0]?.heightPoints ?? 0) - expectedHeight) <= 1);
    }

    await writeFile(inputPath, artifact(
      "@layer print{@page{size:4in 3in;margin:0}}body{margin:0}",
      '<main data-unslide-page="one">Layered page geometry</main>',
    ));
    const layeredResult = await exportHtmlPdf(inputPath, outputPath);
    assert.equal(layeredResult.pages[0]?.widthPoints, 288);
    assert.equal(layeredResult.pages[0]?.heightPoints, 216);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects implicit or ambiguous authored page geometry without replacing prior output", async () => {
  const directory = await temporaryDirectory("unslide pdf geometry ");
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  try {
    await writeFile(outputPath, "prior delivery");
    await writeFile(inputPath, artifact("body{margin:0}", '<main data-unslide-page="one">Missing geometry</main>'));
    await assert.rejects(exportHtmlPdf(inputPath, outputPath), /active, unqualified @page rule.*Letter fallback/);
    assert.equal(await readFile(outputPath, "utf8"), "prior delivery");

    const implicitSizes = ["auto", "inherit", "initial", "unset", "revert", "portrait", "landscape"];
    for (const size of implicitSizes) {
      await writeFile(inputPath, artifact(
        `@page{size:${size}}body{margin:0}`,
        '<main data-unslide-page="one">Implicit geometry</main>',
      ));
      await assert.rejects(exportHtmlPdf(inputPath, outputPath), /non-concrete @page size/);
      assert.equal(await readFile(outputPath, "utf8"), "prior delivery");
    }

    await writeFile(inputPath, artifact(
      "@supports (display: definitely-not-a-display-value){@page{size:4in 3in}}body{margin:0}",
      '<main data-unslide-page="one">Inactive geometry</main>',
    ));
    await assert.rejects(exportHtmlPdf(inputPath, outputPath), /active, unqualified @page rule/);

    await writeFile(inputPath, artifact(
      "body{margin:0}",
      '<style media="screen">@page{size:letter}</style><main data-unslide-page="one">Screen-only geometry</main>',
    ));
    await assert.rejects(exportHtmlPdf(inputPath, outputPath), /active, unqualified @page rule/);

    await writeFile(inputPath, artifact(
      "@page{size:4in 3in;margin:0}body{margin:0}",
      '<style media="screen">@page{size:letter}</style><main data-unslide-page="one">Print geometry wins</main>',
    ));
    const activePrintGeometry = await exportHtmlPdf(inputPath, outputPath);
    assert.equal(activePrintGeometry.pages[0]?.widthPoints, 288);
    assert.equal(activePrintGeometry.pages[0]?.heightPoints, 216);

    await writeFile(inputPath, artifact(
      "@page{size:4in 3in;margin:0}body{margin:0}",
      '<style>@page{size:letter}</style><script>document.currentScript.previousElementSibling.sheet.disabled = true</script><main data-unslide-page="one">Disabled geometry ignored</main>',
    ));
    const disabledGeometry = await exportHtmlPdf(inputPath, outputPath);
    assert.equal(disabledGeometry.pages[0]?.widthPoints, 288);
    assert.equal(disabledGeometry.pages[0]?.heightPoints, 216);
    await writeFile(outputPath, "prior delivery");

    await writeFile(inputPath, artifact(
      "@page:first{size:4in 3in}body{margin:0}",
      '<main data-unslide-page="one">Qualified geometry</main>',
    ));
    await assert.rejects(exportHtmlPdf(inputPath, outputPath), /active, unqualified @page rule/);

    await writeFile(inputPath, artifact(
      "@page{size:4in 3in}@page:first{size:5in 3in}body{margin:0}",
      '<main data-unslide-page="one">Ambiguous geometry</main>',
    ));
    await assert.rejects(exportHtmlPdf(inputPath, outputPath), /ambiguous @page sizes/);
    assert.equal(await readFile(outputPath, "utf8"), "prior delivery");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects extra printed sheets before publishing a misleading PDF", async () => {
  const directory = await temporaryDirectory("unslide pdf overflow ");
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  try {
    await writeFile(outputPath, "prior delivery");
    await writeFile(inputPath, artifact(
      "@page{size:4in 3in;margin:0}body{margin:0}main,aside{width:4in;height:3in}main{break-after:page}",
      '<main data-unslide-page="one">Marked report page</main><aside>Unmarked extra sheet</aside>',
    ));

    await assert.rejects(exportHtmlPdf(inputPath, outputPath), /PDF page count 2 does not match the 1 marked HTML pages/);
    assert.equal(await readFile(outputPath, "utf8"), "prior delivery");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("shares artifact readiness failures for missing images and fonts", async () => {
  const directory = await temporaryDirectory("unslide pdf resources ");
  try {
    await assert.rejects(
      exportHtmlPdf(resolve("tests/fixtures/protocol-broken-image.html"), resolve(directory, "image.pdf")),
      (error: unknown) => {
        const imageIssue = artifactIssues(error).find((issue) => issue.code === "image-readiness");
        assert.match(imageIssue?.resource ?? "", /missing-image\.png$/);
        return true;
      },
    );
    await assert.rejects(
      exportHtmlPdf(resolve("tests/fixtures/protocol-broken-font.html"), resolve(directory, "font.pdf")),
      (error: unknown) => {
        const fontIssue = artifactIssues(error).find((issue) => issue.code === "font-readiness");
        assert.match(fontIssue?.resource ?? "", /Broken Fixture Font/);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports an invalid PDF output target and removes staging files", async () => {
  const directory = await temporaryDirectory("unslide pdf output ");
  const inputPath = resolve(directory, "report.html");
  const invalidOutput = resolve(directory, "report.pdf");
  try {
    await writeFile(inputPath, artifact(
      "@page{size:4in 3in;margin:0}body{margin:0}",
      '<main data-unslide-page="one">Invalid output target</main>',
    ));
    await mkdir(invalidOutput);
    await assert.rejects(exportHtmlPdf(inputPath, invalidOutput), /EISDIR|ENOTEMPTY|directory/i);
    await access(invalidOutput);
    assert.equal((await readdir(directory)).some((name) => name.startsWith(".unslide-pdf-")), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF validation releases loading tasks and pages while retaining cleanup failures", async () => {
  const directory = await temporaryDirectory("unslide pdf validation lifecycle ");
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  try {
    await writeFile(inputPath, artifact(
      "@page{size:4in 3in;margin:0}body{margin:0}",
      '<main data-unslide-page="one">Scoped PDF validation</main>',
    ));
    await exportHtmlPdf(inputPath, outputPath);
    const prototypes = await pdfRuntimePrototypes(await readFile(outputPath));
    const documentPrototype = prototypes.document as { getPage: (index: number) => Promise<unknown> };
    const loadingTaskPrototype = prototypes.loadingTask as { destroy: () => Promise<void> };
    const pagePrototype = prototypes.page as { cleanup: () => boolean };
    const originalGetPage = documentPrototype.getPage;
    const originalDestroy = loadingTaskPrototype.destroy;
    const originalCleanup = pagePrototype.cleanup;
    let destroyCalls = 0;
    let cleanupCalls = 0;
    try {
      loadingTaskPrototype.destroy = async function() {
        destroyCalls += 1;
        await originalDestroy.call(this);
      };
      pagePrototype.cleanup = function() {
        cleanupCalls += 1;
        return originalCleanup.call(this);
      };
      await exportHtmlPdf(inputPath, outputPath);
      assert.deepEqual({ cleanupCalls, destroyCalls }, { cleanupCalls: 1, destroyCalls: 1 });

      let startPageLoad: (() => void) | undefined;
      const pageLoadStarted = new Promise<void>((resolveStarted) => {
        startPageLoad = resolveStarted;
      });
      documentPrototype.getPage = async function() {
        startPageLoad?.();
        return new Promise<never>(() => {});
      };
      destroyCalls = 0;
      const controller = new AbortController();
      const interrupted = exportHtmlPdf(inputPath, outputPath, { signal: controller.signal });
      await pageLoadStarted;
      controller.abort();
      await assert.rejects(interrupted, /Operation interrupted/);
      assert.equal(destroyCalls, 1);
      assert.equal((await readFile(outputPath)).subarray(0, 5).toString(), "%PDF-");
      documentPrototype.getPage = originalGetPage;

      await writeFile(inputPath, artifact(
        "@page{size:4in 3in;margin:0}body{margin:0}main,aside{width:4in;height:3in}main{break-after:page}",
        '<main data-unslide-page="one">Primary PDF validation failure</main><aside>Extra sheet</aside>',
      ));
      loadingTaskPrototype.destroy = async function() {
        await originalDestroy.call(this);
        throw new Error("fixture PDF loading-task cleanup failed");
      };
      await assert.rejects(
        exportHtmlPdf(inputPath, outputPath),
        /PDF page count 2 does not match[\s\S]*Cleanup failed: fixture PDF loading-task cleanup failed/,
      );
      assert.equal((await readFile(outputPath)).subarray(0, 5).toString(), "%PDF-");
    } finally {
      documentPrototype.getPage = originalGetPage;
      loadingTaskPrototype.destroy = originalDestroy;
      pagePrototype.cleanup = originalCleanup;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
