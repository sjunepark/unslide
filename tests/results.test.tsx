import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { decode } from "@toon-format/toon";
import type { ProjectConfig, ReportConfig } from "../src/unslide/config.js";
import {
  createExecutionEvidence,
  encodeEnvelope,
  reviewManifestPath,
  successEnvelope,
} from "../src/unslide/results.js";

test("result encodings share one schema value and exactly one trailing newline", () => {
  const envelope = successEnvelope(
    "build",
    {
      kind: "build",
      report: "quarterly-review",
      html: { path: "/reports/quarterly-review.html", bytes: 42, sha256: "a".repeat(64) },
    },
    createExecutionEvidence(),
  );
  const toon = encodeEnvelope("toon", envelope);
  const json = encodeEnvelope("json", envelope);

  assert.equal(toon.endsWith("\n"), true);
  assert.equal(toon.endsWith("\n\n"), false);
  assert.equal(json.endsWith("\n"), true);
  assert.equal(json.endsWith("\n\n"), false);
  assert.deepEqual(decode(toon), JSON.parse(json));
});

test("review manifest derivation is stable and avoids every configured path", () => {
  const projectRoot = resolve("/tmp/unslide-result-contract");
  const report: ReportConfig = {
    name: "report",
    sourcePath: resolve(projectRoot, "report.tsx"),
    htmlPath: resolve(projectRoot, "artifacts/report.html"),
    pdfPath: resolve(projectRoot, "artifacts/report.pdf"),
    captureDirectory: resolve(projectRoot, "captures/report"),
    pdfCaptureDirectory: resolve(projectRoot, "pdf-captures/report"),
  };
  const occupied: ReportConfig = {
    name: "occupied",
    sourcePath: resolve(projectRoot, "occupied.tsx"),
    htmlPath: resolve(projectRoot, "artifacts/occupied.html"),
    pdfPath: resolve(projectRoot, "artifacts/occupied.pdf"),
    captureDirectory: resolve(projectRoot, "artifacts/report.review.json"),
    pdfCaptureDirectory: resolve(projectRoot, "artifacts/report.review-2.json"),
  };
  const config: ProjectConfig = {
    version: 1,
    configPath: resolve(projectRoot, "unslide.json"),
    projectRoot,
    reports: { occupied, report },
  };

  assert.equal(
    reviewManifestPath(config, report),
    resolve(projectRoot, "artifacts/report.review-3.json"),
  );
  assert.equal(reviewManifestPath(config, report), reviewManifestPath(config, report));
});
