import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";
import { captureHtmlPages } from "../src/unslide/capture.js";
import { validateArtifact } from "../src/unslide/protocol.js";
import {
  inlineAsset,
  readTextAsset,
  writeReportHtml,
} from "../src/unslide/render.js";

function TestDocument({ styles = "" }: { styles?: string }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="unslide-protocol" content="1" />
        <meta name="author" content="Report owner" />
        <title>Test &lt;/title&gt; report</title>
        <style>{styles}</style>
      </head>
      <body data-owner="fixture">
        <main className="anything">
          <article data-unslide-page="alpha"><p>First page</p></article>
          <figure data-unslide-page="beta"><figcaption>Second page</figcaption></figure>
        </main>
      </body>
    </html>
  );
}

async function createTestReport(directory: string) {
  const outputPath = resolve(directory, "report.html");
  await writeReportHtml({
    document: <TestDocument styles={`
      body { margin: 0; }
      .anything { display: grid; gap: 20px; }
      [data-unslide-page] { width: 480px; height: 300px; background: white; }
    `} />,
    outputPath,
  });
  return outputPath;
}

test("renders a report-owned complete document without visual injection", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-render-"));

  try {
    const outputPath = await createTestReport(directory);
    const html = await readFile(outputPath, "utf8");

    assert.match(html, /^<!doctype html>\n<html lang="ko">/);
    assert.match(html, /<meta name="author" content="Report owner"\/>/);
    assert.match(html, /<title>Test &lt;\/title&gt; report<\/title>/);
    assert.match(html, /<body data-owner="fixture">/);
    assert.equal((html.match(/data-unslide-page=/g) ?? []).length, 2);
    assert.match(html, /class="anything"/);
    assert.doesNotMatch(html, /page-content|page-header|page-footer|297mm|@page/);
    assert.doesNotMatch(html, /<script|<link[^>]+stylesheet|https?:\/\//);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("requires a complete HTML document", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-document-"));
  try {
    await assert.rejects(
      writeReportHtml({ document: <main>Fragment</main>, outputPath: resolve(directory, "report.html") }),
      /complete <html>/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("inlines report-owned raster, SVG, and font assets and reads CSS", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-assets-"));
  try {
    const cssPath = resolve(directory, "report.css");
    const pngPath = resolve(directory, "pixel.png");
    const svgPath = resolve(directory, "mark.svg");
    const fontPath = resolve(directory, "report.woff2");
    await writeFile(cssPath, ".mark { width: 20px; }");
    await writeFile(pngPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64"));
    await writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" cx="4" cy="4"/></svg>');
    const fontFixture = await readTextAsset(resolve("tests/fixtures/assets/codicon-subset.woff2.b64"));
    await writeFile(fontPath, Buffer.from(fontFixture.trim(), "base64"));

    const [css, png, svg, font] = await Promise.all([
      readTextAsset(cssPath),
      inlineAsset(pngPath),
      inlineAsset(svgPath),
      inlineAsset(fontPath),
    ]);
    const outputPath = resolve(directory, "report.html");
    await writeReportHtml({
      document: (
        <html lang="en">
          <head><style>{`@font-face { font-family: Fixture; src: url(${font}); } ${css}`}</style></head>
          <body><img src={png} alt="" /><img className="mark" src={svg} alt="" /><svg aria-label="inline vector"><rect width="5" height="5" /></svg><main data-unslide-page="one" style={{ fontFamily: "Fixture" }}>{"\uEA60"}</main></body>
        </html>
      ),
      outputPath,
    });

    const html = await readFile(outputPath, "utf8");
    assert.match(html, /data:image\/png;base64,/);
    assert.match(html, /data:image\/svg\+xml;base64,/);
    assert.match(html, /data:font\/woff2;base64,/);
    assert.match(html, /<svg aria-label="inline vector">/);
    assert.match(html, /\.mark \{ width: 20px; \}/);

    await writeReportHtml({
      document: <html><body><img src={png} srcSet={`${png} 1x, ${png} 2x`} alt="" /><main data-unslide-page="one" /></body></html>,
      outputPath: resolve(directory, "srcset.html"),
    });

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(outputPath).href, { waitUntil: "load" });
      assert.deepEqual(await page.evaluate(validateArtifact), {
        ok: true,
        pages: [{ id: "one", index: 0, tagName: "main" }],
      });
    } finally {
      await browser.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects unresolved local and network resource dependencies", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-assets-fail-"));
  try {
    await assert.rejects(
      writeReportHtml({
        document: <html><head><link rel="stylesheet" href="styles.css" /></head><body><img src="https://example.invalid/image.png" /><svg><image href="local.svg" /></svg><track src="captions.vtt" /><main data-unslide-page="one" /></body></html>,
        outputPath: resolve(directory, "report.html"),
      }),
      /https:\/\/example\.invalid\/image\.png[\s\S]*captions\.vtt[\s\S]*local\.svg[\s\S]*styles\.css/,
    );
    await assert.rejects(inlineAsset(resolve(directory, "missing.png")), /Cannot read local asset/);
    await assert.rejects(readTextAsset(resolve(directory, "missing.css")), /Cannot read local text asset/);
    await assert.rejects(inlineAsset(resolve(directory, "asset.txt")), /unsupported local asset type/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("captures one PNG per page without deleting unrelated output", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-capture-"));
  const outputDirectory = resolve(directory, "captures");

  try {
    const inputPath = await createTestReport(directory);
    await captureHtmlPages(inputPath, outputDirectory);
    await writeFile(resolve(outputDirectory, "keep.txt"), "keep this file");
    await writeFile(resolve(outputDirectory, "page-99.png"), "stale capture");
    await captureHtmlPages(inputPath, outputDirectory);

    assert.deepEqual(
      (await readdir(outputDirectory)).sort(),
      ["keep.txt", "page-01.png", "page-02.png"],
    );

    for (const fileName of ["page-01.png", "page-02.png"]) {
      const png = await readFile(resolve(outputDirectory, fileName));
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [480, 300]);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
