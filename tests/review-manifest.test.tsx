import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { publishReviewManifest } from "../src/unslide/review-manifest.js";
import type { ReviewManifest } from "../src/unslide/results.js";
import { runUnslide } from "./runtime.js";

test("review manifests publish as compact newline-terminated schema-v1 JSON", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide-review-manifest-"));
  const output = resolve(directory, "report.review.json");
  const manifest: ReviewManifest = {
    manifestSchemaVersion: 1,
    resultSchemaVersion: 1,
    toolVersion: "0.0.0-test",
    report: "report",
    createdAt: "2026-07-29T00:00:00.000Z",
    scope: { kind: "page", id: "summary", number: 2 },
    html: { path: resolve(directory, "report.html"), bytes: 10, sha256: "a".repeat(64) },
    pages: [
      { id: "cover", number: 1, selected: false },
      {
        id: "summary",
        number: 2,
        selected: true,
        htmlCapture: {
          path: resolve(directory, "page-02.png"),
          bytes: 20,
          sha256: "b".repeat(64),
          widthPixels: 960,
          heightPixels: 540,
        },
      },
    ],
    warnings: [],
    timings: [{ step: "manifest.prepare", status: "completed", durationMs: 0 }],
  };

  try {
    const evidence = await runUnslide(publishReviewManifest(output, manifest));
    const text = await readFile(output, "utf8");
    assert.equal(text, `${JSON.stringify(manifest)}\n`);
    assert.equal(evidence.path, output);
    assert.equal(evidence.bytes, Buffer.byteLength(text));
    assert.equal(evidence.sha256, createHash("sha256").update(text).digest("hex"));
    assert.equal(text.endsWith("\n\n"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
