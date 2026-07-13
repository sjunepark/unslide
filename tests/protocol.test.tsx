import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { chromium } from "playwright";
import {
  PAGE_MARKER_ATTRIBUTE,
  UNSLIDE_PROTOCOL_VERSION,
  validateArtifact,
} from "../src/unslide/protocol.js";

const execFileAsync = promisify(execFile);
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
    await execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/capture.ts",
        resolve(fixtureDirectory, "protocol-valid.html"),
        directory,
      ],
      { cwd: resolve(".") },
    );

    assert.deepEqual((await readdir(directory)).sort(), ["page-01.png", "page-02.png"]);

    const firstPage = await readFile(resolve(directory, "page-01.png"));
    const secondPage = await readFile(resolve(directory, "page-02.png"));
    assert.deepEqual([firstPage.readUInt32BE(16), firstPage.readUInt32BE(20)], [480, 300]);
    assert.deepEqual([secondPage.readUInt32BE(16), secondPage.readUInt32BE(20)], [320, 420]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
