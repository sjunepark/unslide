import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { decode } from "@toon-format/toon";
import { validateProjectConfigContents } from "../src/unslide/config.js";
import {
  createExecutionEvidence,
  encodeEnvelope,
  successEnvelope,
} from "../src/unslide/results.js";
import { runUnslide } from "./runtime.js";

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

test("loaded configuration skips a manifest candidate that aliases an existing output", async () => {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "unslide-manifest-alias-"));
  const configPath = resolve(projectRoot, "unslide.json");
  try {
    await mkdir(resolve(projectRoot, "artifacts"));
    await writeFile(resolve(projectRoot, "report.tsx"), "export default null;\n");
    await writeFile(resolve(projectRoot, "artifacts", "report.pdf"), "existing output");
    await symlink("report.pdf", resolve(projectRoot, "artifacts", "report.review.json"));
    const configText = JSON.stringify({
      version: 1,
      reports: { report: { source: "report.tsx" } },
    });

    const config = await runUnslide(validateProjectConfigContents(configPath, configText));
    assert.equal(
      config.reports.report?.manifestPath,
      resolve(projectRoot, "artifacts", "report.review-2.json"),
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("loaded configuration skips a derived manifest candidate that resolves outside the project", async () => {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "unslide-manifest-outside-"));
  const outsideRoot = await mkdtemp(resolve(tmpdir(), "unslide-manifest-target-"));
  const configPath = resolve(projectRoot, "unslide.json");
  try {
    await mkdir(resolve(projectRoot, "artifacts"));
    await writeFile(resolve(projectRoot, "report.tsx"), "export default null;\n");
    await writeFile(resolve(outsideRoot, "manifest.json"), "outside");
    await symlink(
      resolve(outsideRoot, "manifest.json"),
      resolve(projectRoot, "artifacts", "report.review.json"),
    );
    const configText = JSON.stringify({
      version: 1,
      reports: { report: { source: "report.tsx" } },
    });

    const config = await runUnslide(validateProjectConfigContents(configPath, configText));
    assert.equal(
      config.reports.report?.manifestPath,
      resolve(projectRoot, "artifacts", "report.review-2.json"),
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});
