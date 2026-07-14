import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { withLoadedArtifact } from "../src/unslide/browser.js";
import { captureHtmlPages as captureHtmlPagesEffect } from "../src/unslide/capture.js";
import {
  PAGE_MARKER_ATTRIBUTE,
  PROTOCOL_META_NAME,
  UNSLIDE_PROTOCOL_VERSION,
  validateArtifact,
} from "../src/unslide/protocol.js";
import { runUnslide } from "./runtime.js";

const captureHtmlPages = (input: string, output: string) =>
  runUnslide(captureHtmlPagesEffect(input, output));

const fixtureDirectory = resolve("tests/fixtures");

async function validateFixture(fileName: string) {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(fixtureDirectory, fileName)).href, {
      waitUntil: "load",
    });
    return await page.evaluate(validateArtifact);
  } finally {
    await browser.close();
  }
}

test("protocol v1 preserves ordered metadata for arbitrary marked elements", async () => {
  assert.equal(UNSLIDE_PROTOCOL_VERSION, 1);
  assert.equal(PROTOCOL_META_NAME, "unslide-protocol");
  assert.equal(PAGE_MARKER_ATTRIBUTE, "data-unslide-page");

  const result = await validateFixture("protocol-valid.html");

  assert.deepEqual(result, {
    ok: true,
    pages: [
      { id: "summary", index: 0, tagName: "article" },
      { id: "observation", index: 1, tagName: "figure" },
    ],
  });
});

test("browser validator literals stay aligned with exported protocol constants", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<meta name="${PROTOCOL_META_NAME}" content="${UNSLIDE_PROTOCOL_VERSION}"><main ${PAGE_MARKER_ATTRIBUTE}="aligned">Aligned protocol</main>`,
    );

    assert.deepEqual(await page.evaluate(validateArtifact), {
      ok: true,
      pages: [{ id: "aligned", index: 0, tagName: "main" }],
    });
  } finally {
    await browser.close();
  }
});

test("protocol validation rejects unsupported artifact versions with migration guidance", async () => {
  const result = await validateFixture("protocol-unsupported-version.html");

  assert.equal(result.ok, false);
  if (result.ok) assert.fail("Unsupported protocol fixture unexpectedly passed validation");
  assert.equal(result.issues[0]?.code, "protocol-version");
  assert.match(result.issues[0]?.message ?? "", /supports version 1.*automatic migration is not available/);
});

test("protocol validation identifies missing, empty, and duplicate page IDs", async () => {
  const [missingPages, emptyId, duplicateId] = await Promise.all([
    validateFixture("protocol-no-pages.html"),
    validateFixture("protocol-missing-id.html"),
    validateFixture("protocol-duplicate-id.html"),
  ]);

  assert.equal(missingPages.ok, false);
  assert.equal(emptyId.ok, false);
  assert.equal(duplicateId.ok, false);

  if (missingPages.ok || emptyId.ok || duplicateId.ok) {
    assert.fail("Invalid protocol fixtures unexpectedly passed validation");
  }

  assert.deepEqual(missingPages.issues.map(({ code }) => code), ["missing-pages"]);
  assert.match(emptyId.issues[0]?.message ?? "", /Page 1.*empty data-unslide-page/);
  assert.match(duplicateId.issues[0]?.message ?? "", /"same".*positions 1, 2/);
});

test("protocol validation reports image failures with page and resource context", async () => {
  const result = await validateFixture("protocol-broken-image.html");

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Broken image fixture unexpectedly passed validation");
  }

  assert.equal(result.issues[0]?.code, "image-readiness");
  assert.equal(result.issues[0]?.pageId, "resources");
  assert.match(result.issues[0]?.resource ?? "", /missing-image\.png$/);
  assert.match(result.issues[0]?.message ?? "", /page "resources"/);
});

test("protocol validation reports failed font faces", async () => {
  const result = await validateFixture("protocol-broken-font.html");

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Broken font fixture unexpectedly passed validation");
  }

  assert.equal(result.issues[0]?.code, "font-readiness");
  assert.match(result.issues[0]?.resource ?? "", /Broken Fixture Font/);
});

test("protocol validation bounds a font request that never settles", async () => {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.route("https://fixture.invalid/**", () => {});
    await page.setContent('<main data-unslide-page="pending">Waiting font</main>');
    await page.evaluate(() => {
      const font = new FontFace(
        "Pending Fixture Font",
        "url(https://fixture.invalid/never.woff2)",
      );
      document.fonts.add(font);
      void font.load();
    });

    const startedAt = Date.now();
    const result = await page.evaluate(validateArtifact);

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Pending font unexpectedly passed validation");
    }

    assert.equal(result.issues[0]?.code, "font-readiness");
    assert.match(result.issues[0]?.resource ?? "", /Pending Fixture Font/);
    assert.match(result.issues[0]?.message ?? "", /within 5000ms/);
    assert.ok(Date.now() - startedAt < 7_000);
  } finally {
    await browser.close();
  }
});

test("protocol validation bounds an image request that never settles", async () => {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.route("https://fixture.invalid/**", () => {});
    await page.setContent('<main data-unslide-page="pending">Waiting image</main>');
    await page.evaluate(() => {
      const image = document.createElement("img");
      image.src = "https://fixture.invalid/never.png";
      document.querySelector("main")?.append(image);
    });

    const startedAt = Date.now();
    const result = await page.evaluate(validateArtifact);

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Pending image unexpectedly passed validation");
    }

    assert.equal(result.issues[0]?.code, "image-readiness");
    assert.match(result.issues[0]?.message ?? "", /within 5000ms.*page "pending"/);
    assert.ok(Date.now() - startedAt < 7_000);
  } finally {
    await browser.close();
  }
});

test("capture consumes the protocol for a non-A4 chrome-free fixture", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-protocol-capture-"));

  try {
    const inputPath = resolve(fixtureDirectory, "protocol-valid.html");
    const firstResult = await captureHtmlPages(inputPath, directory);

    assert.deepEqual((await readdir(directory)).sort(), ["page-01.png", "page-02.png"]);
    assert.deepEqual(firstResult, {
      inputPath,
      outputDirectory: directory,
      pages: [
        { id: "summary", index: 0, width: 480, height: 300, outputPath: resolve(directory, "page-01.png") },
        { id: "observation", index: 1, width: 320, height: 420, outputPath: resolve(directory, "page-02.png") },
      ],
    });

    const firstPage = await readFile(resolve(directory, "page-01.png"));
    const secondPage = await readFile(resolve(directory, "page-02.png"));
    assert.deepEqual([firstPage.readUInt32BE(16), firstPage.readUInt32BE(20)], [480, 300]);
    assert.deepEqual([secondPage.readUInt32BE(16), secondPage.readUInt32BE(20)], [320, 420]);

    await writeFile(resolve(directory, "page-99.png"), "stale capture");
    await writeFile(resolve(directory, "keep.txt"), "unrelated evidence");
    const hashes = [firstPage, secondPage].map((contents) => createHash("sha256").update(contents).digest("hex"));
    await captureHtmlPages(inputPath, directory);
    assert.deepEqual((await readdir(directory)).sort(), ["keep.txt", "page-01.png", "page-02.png"]);
    assert.deepEqual(
      await Promise.all(["page-01.png", "page-02.png"].map(async (name) =>
        createHash("sha256").update(await readFile(resolve(directory, name))).digest("hex"))),
      hashes,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("capture preserves prior output when artifact validation or capture fails", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-capture-failure-"));
  try {
    const priorCapture = resolve(directory, "page-01.png");
    await writeFile(priorCapture, "prior evidence");

    await assert.rejects(
      captureHtmlPages(resolve(fixtureDirectory, "protocol-duplicate-id.html"), directory),
      /Artifact readiness failed:[\s\S]*duplicated/,
    );
    assert.equal(await readFile(priorCapture, "utf8"), "prior evidence");

    await assert.rejects(
      captureHtmlPages(resolve(fixtureDirectory, "protocol-hidden-page.html"), directory),
      /Page "hidden".*no visible capture area/,
    );
    assert.equal(await readFile(priorCapture, "utf8"), "prior evidence");

    const conflictingDirectory = resolve(directory, "page-02.png");
    await mkdir(conflictingDirectory);
    await assert.rejects(
      captureHtmlPages(resolve(fixtureDirectory, "protocol-valid.html"), directory),
      /Cannot publish page captures; previous captures were restored/,
    );
    assert.equal(await readFile(priorCapture, "utf8"), "prior evidence");
    assert.equal((await stat(conflictingDirectory)).isDirectory(), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("capture reports console and failed local resource errors", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-capture-diagnostics-"));
  try {
    await assert.rejects(
      captureHtmlPages(resolve(fixtureDirectory, "protocol-console-error.html"), directory),
      /Console error: fixture exploded/,
    );
    await assert.rejects(
      captureHtmlPages(resolve(fixtureDirectory, "protocol-broken-style.html"), directory),
      /Resource failed: .*missing-style\.css/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("capture bounds document loading and names a pending resource", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-capture-timeout-"));
  const server = createServer(() => {});
  try {
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const resourceUrl = `http://127.0.0.1:${address.port}/never.css`;
    const inputPath = resolve(directory, "pending.html");
    await writeFile(inputPath, `<!doctype html><html><head><link rel="stylesheet" href="${resourceUrl}"></head><body><main data-unslide-page="pending">Pending</main></body></html>`);

    const startedAt = Date.now();
    await assert.rejects(
      captureHtmlPages(inputPath, resolve(directory, "captures")),
      /Document did not finish loading within 5000ms[\s\S]*Resource still pending: .*never\.css/,
    );
    assert.ok(Date.now() - startedAt < 7_000);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("capture names a resource that blocks DOM parsing", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-navigation-timeout-"));
  const server = createServer(() => {});
  try {
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const resourceUrl = `http://127.0.0.1:${address.port}/never.js`;
    const inputPath = resolve(directory, "pending-script.html");
    await writeFile(inputPath, `<!doctype html><html><head><script src="${resourceUrl}"></script></head><body><main data-unslide-page="pending">Pending</main></body></html>`);

    await assert.rejects(
      captureHtmlPages(inputPath, resolve(directory, "captures")),
      /Cannot load HTML artifact .*Pending resources: .*never\.js/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("capture tracks concurrent requests to the same URL independently", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-duplicate-request-"));
  let sharedRequests = 0;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");
  const server = createServer((request, response) => {
    if (request.url === "/shared") {
      sharedRequests += 1;
      response.setHeader("Access-Control-Allow-Origin", "*");
      if (sharedRequests === 1) response.end("ready");
      return;
    }
    if (request.url === "/gate.png") {
      setTimeout(() => {
        response.setHeader("Content-Type", "image/png");
        response.end(png);
      }, 200);
      return;
    }
    response.statusCode = 404;
    response.end();
  });

  try {
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const inputPath = resolve(directory, "duplicate-request.html");
    await writeFile(inputPath, `<!doctype html><html><body><script>void fetch("${origin}/shared"); void fetch("${origin}/shared");</script><main data-unslide-page="one"><img src="${origin}/gate.png" alt=""></main></body></html>`);

    await assert.rejects(
      captureHtmlPages(inputPath, resolve(directory, "captures")),
      /Resource still pending: .*\/shared/,
    );
    assert.equal(sharedRequests, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("loaded artifacts release Chromium after success and operational failure", async () => {
  const inputPath = resolve(fixtureDirectory, "protocol-valid.html");
  let successfulBrowser: Browser | undefined;
  await withLoadedArtifact(inputPath, async ({ page }) => {
    successfulBrowser = page.context().browser() ?? undefined;
  });
  assert.equal(successfulBrowser?.isConnected(), false);

  let failedBrowser: Browser | undefined;
  await assert.rejects(
    withLoadedArtifact(inputPath, async ({ page }) => {
      failedBrowser = page.context().browser() ?? undefined;
      throw new Error("fixture operation failed");
    }),
    /fixture operation failed/,
  );
  assert.equal(failedBrowser?.isConnected(), false);
});

test("interrupting a loaded artifact closes the underlying Chromium work", async () => {
  const controller = new AbortController();
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolveStarted) => {
    markStarted = resolveStarted;
  });
  let browser: Browser | undefined;
  const pending = withLoadedArtifact(
    resolve(fixtureDirectory, "protocol-valid.html"),
    async ({ page }) => {
      browser = page.context().browser() ?? undefined;
      markStarted?.();
      return new Promise<never>(() => {});
    },
    { signal: controller.signal },
  );

  await started;
  controller.abort();
  await assert.rejects(pending, /Operation interrupted/);
  assert.equal(browser?.isConnected(), false);
});

test("loaded artifacts retain primary and Chromium cleanup failures together", async () => {
  await assert.rejects(
    withLoadedArtifact(resolve(fixtureDirectory, "protocol-valid.html"), async ({ page }) => {
      const browser = page.context().browser();
      assert.ok(browser);
      const close = browser.close.bind(browser);
      browser.close = async (options) => {
        await close(options);
        throw new Error("fixture browser cleanup failed");
      };
      throw new Error("fixture primary operation failed");
    }),
    /fixture primary operation failed[\s\S]*Cleanup failed: fixture browser cleanup failed/,
  );
});

test("capture implementation is independent of React authoring", async () => {
  const sources = await Promise.all([
    readFile(resolve("src/unslide/browser.ts"), "utf8"),
    readFile(resolve("src/unslide/capture.ts"), "utf8"),
  ]);
  assert.doesNotMatch(sources.join("\n"), /react|\.\/render\.js/i);
});
