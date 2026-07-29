import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  exportHtmlPdf as exportHtmlPdfEffect,
  samplePageText,
  validatePageTextSamples,
} from "../src/unslide/pdf.js";
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

test("PDF text evidence samples distinctive beginning, middle, and ending regions", () => {
  const samples = samplePageText(
    "Beginning alpha beta gamma middle delta epsilon zeta ending eta theta omega",
  );
  assert.deepEqual(
    samples.map((sample) => sample.region),
    ["beginning", "middle", "ending"],
  );
  assert.deepEqual(samples[0]?.tokens, ["beginning", "alpha", "beta"]);
  assert.deepEqual(samples.at(-1)?.tokens, ["eta", "theta", "omega"]);
  assert.deepEqual(samplePageText("same same"), [
    { region: "beginning", tokens: ["same", "same"] },
  ]);
});

test("PDF text evidence validates every page rather than accepting a repeated header", () => {
  const first =
    "Shared report header alpha stable content common middle marker stable content common ending footer close";
  const second =
    "Shared report header beta stable content common middle marker stable content common ending footer close";
  assert.deepEqual(samplePageText(first), samplePageText(second));
  const expected = [
    {
      id: "one",
      index: 1,
      samples: samplePageText(first, [second]),
    },
    {
      id: "two",
      index: 2,
      samples: samplePageText(second, [first]),
    },
  ];
  assert.ok(expected[0]!.samples.length > samplePageText(first).length);
  const extracted = [first, first];
  const failure = validatePageTextSamples(expected, extracted, [
    { textSample: extracted[0] ?? "" },
    { textSample: extracted[1] ?? "" },
  ]);

  assert.match(failure ?? "", /PDF page 2 \(two\).*extractable-text sample/);
  assert.doesNotMatch(failure ?? "", /PDF page 1/);

  const subset = validatePageTextSamples(
    [
      {
        id: "subset",
        index: 1,
        samples: samplePageText("a b c d", ["a b c x b c d"]),
        normalizedCoverage: { letters: "abcd", numbers: [] },
      },
      {
        id: "superset",
        index: 2,
        samples: samplePageText("a b c x b c d", ["a b c d"]),
      },
    ],
    ["a b c x b c d", "a b c x b c d"],
    [{ textSample: "a b c x b c d" }, { textSample: "a b c x b c d" }],
  );
  assert.match(subset ?? "", /PDF page 1 \(subset\).*extractable-text sample/);

  const normalizedCoverage = validatePageTextSamples(
    [
      {
        id: "subset",
        index: 1,
        samples: samplePageText("a b c d", ["a b c x b c d"]),
        normalizedCoverage: { letters: "abcd", numbers: [] },
      },
      {
        id: "superset",
        index: 2,
        samples: samplePageText("a b c x b c d", ["a b c d"]),
      },
    ],
    ["a b c d", "a b c x b c d"],
    [{ textSample: "a b c d" }, { textSample: "a b c x b c d" }],
  );
  assert.equal(normalizedCoverage, undefined);

  const reorderedCoverage = validatePageTextSamples(
    [
      {
        id: "positioned",
        index: 1,
        samples: samplePageText("important message body"),
        normalizedCoverage: {
          letters: [..."importantmessagebody"].sort().join(""),
          numbers: [],
        },
      },
    ],
    ["body 1 2 3 important message"],
    [{ textSample: "body 1 2 3 important message" }],
  );
  assert.equal(reorderedCoverage, undefined);

  const missingAuthoredNumber = validatePageTextSamples(
    [
      {
        id: "financials",
        index: 1,
        samples: samplePageText("Revenue 123"),
        normalizedCoverage: {
          letters: [..."revenue"].sort().join(""),
          numbers: ["123"],
        },
      },
    ],
    ["Revenue"],
    [{ textSample: "Revenue" }],
  );
  assert.match(missingAuthoredNumber ?? "", /PDF page 1 \(financials\)/);

  const changedAuthoredNumber = validatePageTextSamples(
    [
      {
        id: "financials",
        index: 1,
        samples: samplePageText("Revenue 123"),
        normalizedCoverage: {
          letters: [..."revenue"].sort().join(""),
          numbers: ["123"],
        },
      },
    ],
    ["Revenue 124"],
    [{ textSample: "Revenue 124" }],
  );
  assert.match(changedAuthoredNumber ?? "", /PDF page 1 \(financials\)/);

  const generatedCounterNumbers = validatePageTextSamples(
    [
      {
        id: "financials",
        index: 1,
        samples: samplePageText("Revenue 123"),
        normalizedCoverage: {
          letters: [..."revenue"].sort().join(""),
          numbers: ["123"],
        },
      },
    ],
    ["01 Revenue 123 02"],
    [{ textSample: "01 Revenue 123 02" }],
  );
  assert.equal(generatedCounterNumbers, undefined);
});

async function temporaryDirectory(prefix: string): Promise<string> {
  await mkdir(resolve(repositoryRoot, ".tmp"), { recursive: true });
  return mkdtemp(resolve(repositoryRoot, ".tmp", prefix));
}

function artifactIssues(error: unknown): Array<{ code: string; resource?: string }> {
  const cause =
    error instanceof Error
      ? (error as Error & { cause?: { reasons?: unknown[] } }).cause
      : undefined;
  return (
    cause?.reasons?.flatMap((reason) => {
      if (
        typeof reason !== "object" ||
        reason === null ||
        !("_tag" in reason) ||
        reason._tag !== "Fail" ||
        !("error" in reason) ||
        typeof reason.error !== "object" ||
        reason.error === null ||
        !("issues" in reason.error) ||
        !Array.isArray(reason.error.issues)
      )
        return [];
      return reason.error.issues as Array<{ code: string; resource?: string }>;
    }) ?? []
  );
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

async function firstPdfPagePixel(bytes: Uint8Array, x: number, y: number): Promise<number[]> {
  const loadingTask = getDocument({ data: new Uint8Array(bytes) });
  try {
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    try {
      const viewport = page.getViewport({ scale: 96 / 72 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
        background: "#ffffff",
      }).promise;
      return [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
    } finally {
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

test("exports a readable text PDF with authored common geometry", async () => {
  const directory = await temporaryDirectory("unslide pdf success ");
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  try {
    await writeFile(
      inputPath,
      artifact(
        "@page{size:4in 3in;margin:0}*{box-sizing:border-box}body,h1,p{margin:0}main{width:4in;height:3in;background:#173b2c;color:white;break-after:page}main:last-child{break-after:auto}",
        '<main data-unslide-page="one"><h1>Quarterly field note</h1><p>Searchable delivery text.</p></main>',
      ),
    );

    const result = await exportHtmlPdf(inputPath, outputPath);
    assert.equal(result.pages.length, 1);
    assert.equal(result.pages[0]?.id, "one");
    assert.equal(result.pages[0]?.widthPoints, 288);
    assert.equal(result.pages[0]?.heightPoints, 216);
    assert.match(result.pages[0]?.textSample ?? "", /Searchable delivery text/);
    assert.equal((await readFile(outputPath)).subarray(0, 5).toString(), "%PDF-");

    for (const [size, expectedWidth, expectedHeight] of [
      ["100mm 200mm", (100 * 72) / 25.4, (200 * 72) / 25.4],
      ["A3", (297 * 72) / 25.4, (420 * 72) / 25.4],
      ["ledger", 11 * 72, 17 * 72],
    ] as const) {
      await writeFile(
        inputPath,
        artifact(
          `@page{size:${size};margin:0}body{margin:0}`,
          '<main data-unslide-page="one">Pinned Chromium geometry</main>',
        ),
      );
      const geometryResult = await exportHtmlPdf(inputPath, outputPath);
      assert.ok(Math.abs((geometryResult.pages[0]?.widthPoints ?? 0) - expectedWidth) <= 1);
      assert.ok(Math.abs((geometryResult.pages[0]?.heightPoints ?? 0) - expectedHeight) <= 1);
    }

    await writeFile(
      inputPath,
      artifact(
        "@layer print{@page{size:4in 3in;margin:0}}body{margin:0}",
        '<main data-unslide-page="one">Layered page geometry</main>',
      ),
    );
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
    await writeFile(
      inputPath,
      artifact("body{margin:0}", '<main data-unslide-page="one">Missing geometry</main>'),
    );
    await assert.rejects(
      exportHtmlPdf(inputPath, outputPath),
      /active, unqualified @page rule.*Letter fallback/,
    );
    assert.equal(await readFile(outputPath, "utf8"), "prior delivery");

    const implicitSizes = [
      "auto",
      "inherit",
      "initial",
      "unset",
      "revert",
      "portrait",
      "landscape",
    ];
    for (const size of implicitSizes) {
      await writeFile(
        inputPath,
        artifact(
          `@page{size:${size}}body{margin:0}`,
          '<main data-unslide-page="one">Implicit geometry</main>',
        ),
      );
      await assert.rejects(exportHtmlPdf(inputPath, outputPath), /non-concrete @page size/);
      assert.equal(await readFile(outputPath, "utf8"), "prior delivery");
    }

    await writeFile(
      inputPath,
      artifact(
        "@supports (display: definitely-not-a-display-value){@page{size:4in 3in}}body{margin:0}",
        '<main data-unslide-page="one">Inactive geometry</main>',
      ),
    );
    await assert.rejects(exportHtmlPdf(inputPath, outputPath), /active, unqualified @page rule/);

    await writeFile(
      inputPath,
      artifact(
        "body{margin:0}",
        '<style media="screen">@page{size:letter}</style><main data-unslide-page="one">Screen-only geometry</main>',
      ),
    );
    await assert.rejects(exportHtmlPdf(inputPath, outputPath), /active, unqualified @page rule/);

    await writeFile(
      inputPath,
      artifact(
        "@page{size:4in 3in;margin:0}body{margin:0}",
        '<style media="screen">@page{size:letter}</style><main data-unslide-page="one">Print geometry wins</main>',
      ),
    );
    const activePrintGeometry = await exportHtmlPdf(inputPath, outputPath);
    assert.equal(activePrintGeometry.pages[0]?.widthPoints, 288);
    assert.equal(activePrintGeometry.pages[0]?.heightPoints, 216);

    await writeFile(
      inputPath,
      artifact(
        "@page{size:4in 3in;margin:0}body{margin:0}",
        '<style>@page{size:letter}</style><script>document.currentScript.previousElementSibling.sheet.disabled = true</script><main data-unslide-page="one">Disabled geometry ignored</main>',
      ),
    );
    const disabledGeometry = await exportHtmlPdf(inputPath, outputPath);
    assert.equal(disabledGeometry.pages[0]?.widthPoints, 288);
    assert.equal(disabledGeometry.pages[0]?.heightPoints, 216);
    await writeFile(outputPath, "prior delivery");

    await writeFile(
      inputPath,
      artifact(
        "@page:first{size:4in 3in}body{margin:0}",
        '<main data-unslide-page="one">Qualified geometry</main>',
      ),
    );
    await assert.rejects(exportHtmlPdf(inputPath, outputPath), /active, unqualified @page rule/);

    await writeFile(
      inputPath,
      artifact(
        "@page{size:4in 3in}@page:first{size:5in 3in}body{margin:0}",
        '<main data-unslide-page="one">Ambiguous geometry</main>',
      ),
    );
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
    await writeFile(
      inputPath,
      artifact(
        "@page{size:4in 3in;margin:0}body{margin:0}main,aside{width:4in;height:3in}main{break-after:page}",
        '<main data-unslide-page="one">Marked report page</main><aside>Unmarked extra sheet</aside>',
      ),
    );

    await assert.rejects(
      exportHtmlPdf(inputPath, outputPath),
      /PDF page count 2 does not match the 1 marked HTML pages/,
    );
    assert.equal(await readFile(outputPath, "utf8"), "prior delivery");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects pages with identical normalized text before replacing prior output", async () => {
  const directory = await temporaryDirectory("unslide pdf indistinguishable text ");
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  try {
    await writeFile(outputPath, "prior delivery");
    await writeFile(
      inputPath,
      artifact(
        "@page{size:4in 3in;margin:0}body{margin:0}main{width:4in;height:3in;break-after:page}main:last-child{break-after:auto}",
        '<main data-unslide-page="one">a bc d</main><main data-unslide-page="two">ab c d</main>',
      ),
    );

    await assert.rejects(
      exportHtmlPdf(inputPath, outputPath),
      /page 1 \(one\).*neither a distinctive extractable-text sample nor unique normalized full-page letter coverage/,
    );
    assert.equal(await readFile(outputPath, "utf8"), "prior delivery");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("accepts unique normalized full-page letter coverage when one page is a substring of another", async () => {
  const directory = await temporaryDirectory("unslide pdf normalized full page ");
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  try {
    await writeFile(
      inputPath,
      artifact(
        "@page{size:4in 3in;margin:0}body{margin:0}main{width:4in;height:3in;break-after:page}main:last-child{break-after:auto}",
        '<main data-unslide-page="divider">Section 01 Executive Summary 5</main><main data-unslide-page="contents">Contents Section 01 Executive Summary 5 Section 02 Scope 10</main>',
      ),
    );

    const result = await exportHtmlPdf(inputPath, outputPath);
    assert.deepEqual(
      result.pages.map((page) => page.id),
      ["divider", "contents"],
    );
    await access(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects per-page text substitution without replacing the prior PDF", async () => {
  const directory = await temporaryDirectory("unslide pdf text evidence ");
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  const firstPageText =
    "Shared report header alpha stable content common middle marker stable content common ending footer close";
  try {
    await writeFile(
      inputPath,
      artifact(
        "@page{size:4in 3in;margin:0}body{margin:0}main{width:4in;height:3in;break-after:page}main:last-child{break-after:auto}",
        `<main data-unslide-page="one">${firstPageText}</main><main data-unslide-page="two">Shared report header beta stable content common middle marker stable content common ending footer close</main>`,
      ),
    );
    await exportHtmlPdf(inputPath, outputPath);
    const priorPdf = await readFile(outputPath);
    const { page: pagePrototype } = await pdfRuntimePrototypes(priorPdf);
    const prototype = pagePrototype as {
      getTextContent: (this: { pageNumber: number }) => Promise<unknown>;
    };
    const originalGetTextContent = prototype.getTextContent;
    prototype.getTextContent = async function () {
      if (this.pageNumber === 2) return { items: [{ str: firstPageText }] };
      return originalGetTextContent.call(this);
    };
    try {
      await assert.rejects(exportHtmlPdf(inputPath, outputPath), /PDF page 2 \(two\)/);
      assert.deepEqual(await readFile(outputPath), priorPdf);
    } finally {
      prototype.getTextContent = originalGetTextContent;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("shares artifact readiness failures for missing images and fonts", async () => {
  const directory = await temporaryDirectory("unslide pdf resources ");
  try {
    await assert.rejects(
      exportHtmlPdf(
        resolve("tests/fixtures/protocol-broken-image.html"),
        resolve(directory, "image.pdf"),
      ),
      (error: unknown) => {
        const imageIssue = artifactIssues(error).find((issue) => issue.code === "image-readiness");
        assert.match(imageIssue?.resource ?? "", /missing-image\.png$/);
        return true;
      },
    );
    await assert.rejects(
      exportHtmlPdf(
        resolve("tests/fixtures/protocol-broken-font.html"),
        resolve(directory, "font.pdf"),
      ),
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

test(
  "waits boundedly for a print-only image and preserves it in PDF-native output",
  { timeout: 20_000 },
  async () => {
    const directory = await temporaryDirectory("unslide pdf print readiness ");
    const inputPath = resolve(directory, "report.html");
    const outputPath = resolve(directory, "report.pdf");
    const image =
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#ed1c24"/></svg>';
    let responseDelayMs = 350;
    const server = createServer((_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { "Content-Type": "image/svg+xml" });
        response.end(image);
      }, responseDelayMs);
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const { port } = server.address() as AddressInfo;

    try {
      const printArtifact = artifact(
        "@page{size:4in 3in;margin:0}body{margin:0}img{display:block;width:1in;height:1in}",
        `<main data-unslide-page="one"><picture><source media="print" srcset="http://127.0.0.1:${port}/print.svg"><img alt="Print-only red square" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'/%3E"></picture><p>Print resource readiness</p></main>`,
      );
      await writeFile(inputPath, printArtifact);

      const startedAt = Date.now();
      await exportHtmlPdf(inputPath, outputPath);
      assert.ok(
        Date.now() - startedAt >= responseDelayMs - 50,
        "export returned before the print-only resource response",
      );
      assert.deepEqual(
        await firstPdfPagePixel(await readFile(outputPath), 48, 48),
        [237, 28, 36, 255],
      );

      await writeFile(outputPath, "prior delivery");
      responseDelayMs = 5_500;
      await writeFile(inputPath, printArtifact.replace("/print.svg", "/print.svg?timeout"));
      const timeoutStartedAt = Date.now();
      await assert.rejects(exportHtmlPdf(inputPath, outputPath), (error: unknown) => {
        assert.ok(
          artifactIssues(error).some(
            (issue) => issue.code === "image-readiness" || issue.code === "resource-pending",
          ),
        );
        return true;
      });
      const timeoutElapsedMs = Date.now() - timeoutStartedAt;
      assert.ok(
        timeoutElapsedMs >= 4_500 && timeoutElapsedMs < 7_500,
        `unexpected readiness bound: ${timeoutElapsedMs}ms`,
      );
      assert.equal(await readFile(outputPath, "utf8"), "prior delivery");
    } finally {
      await new Promise<void>((resolveClose, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolveClose())),
      );
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("reports an invalid PDF output target and removes staging files", async () => {
  const directory = await temporaryDirectory("unslide pdf output ");
  const inputPath = resolve(directory, "report.html");
  const invalidOutput = resolve(directory, "report.pdf");
  try {
    await writeFile(
      inputPath,
      artifact(
        "@page{size:4in 3in;margin:0}body{margin:0}",
        '<main data-unslide-page="one">Invalid output target</main>',
      ),
    );
    await mkdir(invalidOutput);
    await assert.rejects(exportHtmlPdf(inputPath, invalidOutput), /EISDIR|ENOTEMPTY|directory/i);
    await access(invalidOutput);
    assert.equal(
      (await readdir(directory)).some((name) => name.startsWith(".report.pdf.tmp-")),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF validation releases loading tasks and pages while retaining cleanup failures", async () => {
  const directory = await temporaryDirectory("unslide pdf validation lifecycle ");
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  try {
    await writeFile(
      inputPath,
      artifact(
        "@page{size:4in 3in;margin:0}body{margin:0}",
        '<main data-unslide-page="one">Scoped PDF validation</main>',
      ),
    );
    await exportHtmlPdf(inputPath, outputPath);
    const prototypes = await pdfRuntimePrototypes(await readFile(outputPath));
    const documentPrototype = prototypes.document as {
      getPage: (index: number) => Promise<unknown>;
    };
    const loadingTaskPrototype = prototypes.loadingTask as { destroy: () => Promise<void> };
    const pagePrototype = prototypes.page as { cleanup: () => boolean };
    const originalGetPage = documentPrototype.getPage;
    const originalDestroy = loadingTaskPrototype.destroy;
    const originalCleanup = pagePrototype.cleanup;
    let destroyCalls = 0;
    let cleanupCalls = 0;
    try {
      loadingTaskPrototype.destroy = async function () {
        destroyCalls += 1;
        await originalDestroy.call(this);
      };
      pagePrototype.cleanup = function () {
        cleanupCalls += 1;
        return originalCleanup.call(this);
      };
      await exportHtmlPdf(inputPath, outputPath);
      assert.deepEqual({ cleanupCalls, destroyCalls }, { cleanupCalls: 1, destroyCalls: 1 });

      let startPageLoad: (() => void) | undefined;
      const pageLoadStarted = new Promise<void>((resolveStarted) => {
        startPageLoad = resolveStarted;
      });
      documentPrototype.getPage = async function () {
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

      await writeFile(
        inputPath,
        artifact(
          "@page{size:4in 3in;margin:0}body{margin:0}main,aside{width:4in;height:3in}main{break-after:page}",
          '<main data-unslide-page="one">Primary PDF validation failure</main><aside>Extra sheet</aside>',
        ),
      );
      loadingTaskPrototype.destroy = async function () {
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
