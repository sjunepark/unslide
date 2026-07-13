import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import React from "react";
import { Page } from "../src/unslide/page.js";
import { writeReportHtml } from "../src/unslide/render.js";

const execFileAsync = promisify(execFile);

async function createTestReport(directory: string) {
  const outputPath = resolve(directory, "report.html");
  const chrome = {
    headerLeft: "Test report",
    headerRight: "Fixture",
    footerLeft: "Confidential",
  };

  await writeReportHtml({
    title: "Test </title> report",
    body: (
      <main className="report">
        <Page number={1} total={2} chrome={chrome}>
          <p>First page</p>
        </Page>
        <Page number={2} total={2} chrome={chrome}>
          <p>Second page</p>
        </Page>
      </main>
    ),
    reportStyles: ":root { --page-background: white; }",
    outputPath,
  });

  return outputPath;
}

test("writes a standalone fixed-page HTML artifact", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-render-"));

  try {
    const outputPath = await createTestReport(directory);
    const html = await readFile(outputPath, "utf8");

    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<title>Test &lt;\/title&gt; report<\/title>/);
    assert.equal((html.match(/data-unslide-page=/g) ?? []).length, 2);
    assert.match(html, /width: 297mm/);
    assert.doesNotMatch(html, /<script|<link[^>]+stylesheet|https?:\/\//);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("captures one PNG per page without deleting unrelated output", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-capture-"));
  const outputDirectory = resolve(directory, "captures");

  try {
    const inputPath = await createTestReport(directory);
    await execFileAsync(
      process.execPath,
      ["--import", "tsx", "scripts/capture.ts", inputPath, outputDirectory],
      { cwd: resolve(".") },
    );
    await writeFile(resolve(outputDirectory, "keep.txt"), "keep this file");
    await writeFile(resolve(outputDirectory, "page-99.png"), "stale capture");
    await execFileAsync(
      process.execPath,
      ["--import", "tsx", "scripts/capture.ts", inputPath, outputDirectory],
      { cwd: resolve(".") },
    );

    assert.deepEqual(
      (await readdir(outputDirectory)).sort(),
      ["keep.txt", "page-01.png", "page-02.png"],
    );

    for (const fileName of ["page-01.png", "page-02.png"]) {
      const png = await readFile(resolve(outputDirectory, fileName));
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.ok(png.readUInt32BE(16) >= 1_000);
      assert.ok(png.readUInt32BE(20) >= 700);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
