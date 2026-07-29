import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import test from "node:test";
import { decode } from "@toon-format/toon";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(".");
const repositoryManifest = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
) as {
  name: string;
  version: string;
};

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function runConsumerCli(consumerRoot: string, arguments_: string[]) {
  const { stdout, stderr } = await execFileAsync("pnpm", ["exec", "unslide", ...arguments_], {
    cwd: consumerRoot,
  });
  assert.equal(stderr, "");
  assert.equal(stdout.endsWith("\n"), true);
  assert.equal(stdout.endsWith("\n\n"), false);
  const formatIndex = arguments_.indexOf("--format");
  return formatIndex >= 0 && arguments_[formatIndex + 1] === "json"
    ? (JSON.parse(stdout) as Record<string, unknown>)
    : (decode(stdout) as Record<string, unknown>);
}

async function runConsumerCliFailure(consumerRoot: string, arguments_: string[]) {
  try {
    await execFileAsync("pnpm", ["exec", "unslide", ...arguments_], { cwd: consumerRoot });
    assert.fail(`Expected unslide ${arguments_.join(" ")} to fail`);
  } catch (error) {
    const failure = error as Error & { code?: number; stderr?: string; stdout?: string };
    assert.equal(failure.code, 1);
    assert.equal(failure.stderr, "");
    const stdout = failure.stdout ?? "";
    assert.equal(stdout.endsWith("\n"), true);
    assert.equal(stdout.endsWith("\n\n"), false);
    const formatIndex = arguments_.indexOf("--format");
    return formatIndex >= 0 && arguments_[formatIndex + 1] === "json"
      ? (JSON.parse(stdout) as Record<string, unknown>)
      : (decode(stdout) as Record<string, unknown>);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function pdfContract(bytes: Uint8Array) {
  const loadingTask = getDocument({ data: bytes });
  try {
    const document = await loadingTask.promise;
    const metadata = await document.getMetadata();
    const info = metadata.info as Record<string, unknown>;
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const text = textContent.items
      .filter((item): item is typeof item & { str: string } => "str" in item)
      .map((item) => item.str)
      .join(" ");
    const annotations = await page.getAnnotations();
    const outline = await document.getOutline();
    const markInfo = await document.getMarkInfo();
    const structure = await page.getStructTree();
    return {
      pageCount: document.numPages,
      widthPoints: viewport.width,
      heightPoints: viewport.height,
      language: info.Language,
      title: info.Title,
      creator: info.Creator,
      producer: info.Producer,
      hasStructTree: (metadata as typeof metadata & { hasStructTree?: boolean }).hasStructTree,
      marked: markInfo?.Marked,
      outline: outline?.map((item) => item.title) ?? [],
      text,
      links: annotations.flatMap((annotation) =>
        typeof annotation.url === "string" ? [annotation.url] : [],
      ),
      structure: JSON.stringify(structure),
      hasForms: info.IsAcroFormPresent,
      hasSignatures: info.IsSignaturesPresent,
    };
  } finally {
    await loadingTask.destroy();
  }
}

async function pixelAt(path: string, x: number, y: number): Promise<number[]> {
  const image = await loadImage(path);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return [...context.getImageData(x, y, 1, 1).data];
}

test(
  "packed tooling initializes and runs from a clean external consumer",
  { timeout: 180_000 },
  async () => {
    const packageDirectory = await mkdtemp(resolve(tmpdir(), "unslide-adoption-package-"));
    const consumerRoot = await mkdtemp(resolve(tmpdir(), "unslide-adoption-consumer-"));

    try {
      const canonicalConsumerRoot = await realpath(consumerRoot);
      await execFileAsync("pnpm", ["pack", "--pack-destination", packageDirectory], {
        cwd: repositoryRoot,
      });
      const tarballPath = resolve(
        packageDirectory,
        `${repositoryManifest.name}-${repositoryManifest.version}.tgz`,
      );
      const { stdout: tarListing } = await execFileAsync("tar", ["-tzf", tarballPath]);
      const packedFiles = tarListing.trim().split("\n");
      for (const required of [
        "package/bin/unslide.mjs",
        "package/dist/cli.js",
        "package/dist/unslide/pdf.js",
        "package/dist/unslide/pdf-inspection.js",
        "package/dist/unslide/react.js",
        "package/dist/unslide/react.d.ts",
        "package/docs/CLI.md",
        "package/docs/GUIDE.md",
        "package/docs/PROTOCOL.md",
        "package/docs/SUPPORT.md",
        "package/schema/unslide.schema.json",
        "package/LICENSE",
        "package/README.md",
        "package/package.json",
      ]) {
        assert.ok(packedFiles.includes(required), `Missing packed file: ${required}`);
      }
      assert.equal(
        packedFiles.some(
          (path) =>
            /^package\/(?:src|tests|scripts|\.vscode)\//.test(path) ||
            /^package\/(?:AGENTS|PLAN|PRODUCT|ARCHITECTURE|tsconfig)/.test(path),
        ),
        false,
      );
      await writeFile(
        resolve(consumerRoot, "package.json"),
        `${JSON.stringify(
          {
            name: "unslide-clean-consumer",
            private: true,
            type: "module",
            packageManager: "pnpm@11.12.0",
            dependencies: {
              react: "19.2.0",
              "react-dom": "19.2.0",
              unslide: `file:${tarballPath}`,
            },
            devDependencies: {
              "@types/node": "24.0.13",
              "@types/react": "19.1.8",
              typescript: "5.8.3",
            },
          },
          null,
          2,
        )}\n`,
      );
      await writeFile(
        resolve(consumerRoot, "pnpm-workspace.yaml"),
        "engineStrict: true\nallowBuilds:\n  esbuild: true\n  msgpackr-extract: false\n",
      );
      await execFileAsync("pnpm", ["install"], { cwd: consumerRoot });
      await execFileAsync("pnpm", ["install", "--frozen-lockfile"], { cwd: consumerRoot });

      const commonJsTypecheckRoot = resolve(consumerRoot, "commonjs-typecheck");
      await mkdir(commonJsTypecheckRoot);
      await writeFile(
        resolve(commonJsTypecheckRoot, "package.json"),
        `${JSON.stringify({ private: true }, null, 2)}\n`,
      );
      await runConsumerCli(commonJsTypecheckRoot, [
        "init",
        "--name",
        "typed-review",
        "--starter",
        "business-report",
        "--yes",
      ]);
      await execFileAsync("pnpm", ["exec", "tsc", "--noEmit", "-p", "typed-review/tsconfig.json"], {
        cwd: commonJsTypecheckRoot,
      });

      const installedPackage = await realpath(resolve(consumerRoot, "node_modules", "unslide"));
      assert.ok(installedPackage.startsWith(await realpath(consumerRoot)));
      await access(resolve(installedPackage, "schema", "unslide.schema.json"));
      await access(resolve(installedPackage, "dist", "cli.js"));
      await assert.rejects(access(resolve(installedPackage, "src")), /ENOENT/);
      const installedManifest = JSON.parse(
        await readFile(resolve(installedPackage, "package.json"), "utf8"),
      ) as {
        version: string;
        engines: { node: string };
        exports: Record<string, unknown>;
        dependencies: Record<string, string>;
        peerDependencies: Record<string, string>;
      };
      assert.equal(installedManifest.version, repositoryManifest.version);
      assert.equal(installedManifest.engines.node, ">=24.15 <25");
      assert.deepEqual(Object.keys(installedManifest.exports).sort(), [
        "./cli.md",
        "./guide.md",
        "./protocol.md",
        "./react",
        "./schema/unslide.json",
        "./support.md",
      ]);
      assert.equal(installedManifest.dependencies["pdfjs-dist"], "6.1.200");
      assert.equal(installedManifest.dependencies["@napi-rs/canvas"], "1.0.2");
      assert.equal(installedManifest.dependencies.effect, "4.0.0-beta.97");
      assert.equal(installedManifest.dependencies.react, undefined);
      assert.equal(installedManifest.dependencies["react-dom"], undefined);
      assert.equal(installedManifest.peerDependencies.react, ">=19.1.0 <20");
      assert.equal(installedManifest.peerDependencies["react-dom"], ">=19.1.0 <20");
      assert.match(
        await readFile(resolve(installedPackage, "docs", "GUIDE.md"), "utf8"),
        /unslide review quarterly-review --pdf/,
      );
      assert.match(
        await readFile(resolve(installedPackage, "docs", "CLI.md"), "utf8"),
        /Primitive commands consume existing upstream artifacts/,
      );
      await execFileAsync(
        "node",
        [
          "--input-type=module",
          "--eval",
          'import React from "react"; import UnslideReact from "unslide/react"; if (React !== UnslideReact) process.exit(1);',
        ],
        { cwd: consumerRoot },
      );

      const help = await runConsumerCli(consumerRoot, ["--help"]);
      assert.equal(help.resultSchemaVersion, 1);
      const helpResult = help.result as Record<string, unknown>;
      assert.equal(
        helpResult.usage,
        `${shellQuote(resolve(await realpath(consumerRoot), "node_modules/unslide/bin/unslide.mjs"))} [--format <toon|json>] [--log-level <off|info|debug>] <command>`,
      );
      const jsonHelp = await runConsumerCli(consumerRoot, ["--format", "json", "--help"]);
      assert.equal(jsonHelp.resultSchemaVersion, 1);
      assert.equal(jsonHelp.status, "ok");
      try {
        await runConsumerCli(consumerRoot, []);
        assert.fail("Consumer without configuration unexpectedly showed a project home view");
      } catch (error) {
        const failure = error as Error & { stdout?: string };
        assert.match(failure.stdout ?? "", /project-not-found/);
        assert.match(failure.stdout ?? "", /init/);
      }

      const plan = await runConsumerCli(consumerRoot, ["init"]);
      assert.equal((plan.result as Record<string, unknown>).status, "planned");
      const creation = await runConsumerCli(consumerRoot, ["init", "--yes"]);
      assert.equal((creation.result as Record<string, unknown>).status, "created");
      const repeat = await runConsumerCli(consumerRoot, ["init", "--yes"]);
      assert.equal((repeat.result as Record<string, unknown>).status, "unchanged");
      assert.match(
        await readFile(resolve(consumerRoot, "report.tsx"), "utf8"),
        /from "unslide\/react"/,
      );
      await assert.rejects(access(resolve(consumerRoot, "src", "unslide")), /ENOENT/);
      await assert.rejects(access(resolve(consumerRoot, "scripts", "capture.ts")), /ENOENT/);

      const businessPlan = await runConsumerCli(consumerRoot, [
        "add",
        "business-review",
        "--starter",
        "business-report",
      ]);
      assert.equal((businessPlan.result as Record<string, unknown>).status, "planned");
      await assert.rejects(access(resolve(consumerRoot, "business-review.tsx")), /ENOENT/);
      const businessCreation = await runConsumerCli(consumerRoot, [
        "add",
        "business-review",
        "--starter",
        "business-report",
        "--yes",
      ]);
      assert.equal((businessCreation.result as Record<string, unknown>).status, "created");
      await execFileAsync(
        "pnpm",
        ["exec", "tsc", "--noEmit", "-p", "business-review/tsconfig.json"],
        { cwd: consumerRoot },
      );
      const starterElementBuild = await runConsumerCli(consumerRoot, ["build", "report"]);
      assert.equal((starterElementBuild.result as Record<string, unknown>).kind, "build");
      const businessBuild = await runConsumerCli(consumerRoot, ["build", "business-review"]);
      assert.equal((businessBuild.result as Record<string, unknown>).kind, "build");
      const focusedReview = await runConsumerCli(consumerRoot, [
        "review",
        "business-review",
        "--page-id",
        "highlights",
        "--format",
        "json",
      ]);
      const focusedSummary = (
        (focusedReview.result as Record<string, unknown>).reports as Array<Record<string, unknown>>
      )[0];
      assert.ok(focusedSummary);
      assert.equal(focusedSummary.status, "ok");
      assert.deepEqual(focusedSummary.scope, {
        kind: "page",
        id: "highlights",
        number: 3,
      });
      assert.deepEqual(
        (focusedSummary.pages as Array<Record<string, unknown>>)
          .filter((page) => page.selected)
          .map((page) => page.id),
        ["highlights"],
      );

      const completeReview = await runConsumerCli(consumerRoot, [
        "review",
        "business-review",
        "--pdf",
        "--format",
        "json",
      ]);
      const completeSummary = (
        (completeReview.result as Record<string, unknown>).reports as Array<Record<string, unknown>>
      )[0];
      assert.ok(completeSummary);
      assert.equal(completeSummary.status, "ok");
      assert.deepEqual(completeSummary.scope, { kind: "all" });
      const completePages = completeSummary.pages as Array<Record<string, unknown>>;
      assert.equal(completePages.length, 3);
      for (const page of completePages) {
        assert.equal(page.selected, true);
        assert.equal(typeof page.htmlCapture, "object");
        assert.equal(typeof page.pdfCapture, "object");
      }
      const manifest = completeSummary.manifest as Record<string, unknown>;
      assert.equal(manifest.status, "published");
      await access(manifest.path as string);

      const businessCapture = await runConsumerCli(consumerRoot, ["capture", "business-review"]);
      const businessExport = await runConsumerCli(consumerRoot, ["export", "business-review"]);
      const businessPdfInspection = await runConsumerCli(consumerRoot, [
        "inspect-pdf",
        "business-review",
      ]);
      for (const result of [businessCapture, businessExport, businessPdfInspection]) {
        const pages = (result.result as Record<string, unknown>).pages as Array<
          Record<string, unknown>
        >;
        assert.equal(pages.length, 3);
      }
      for (const result of [businessCapture, businessPdfInspection]) {
        const pages = (result.result as Record<string, unknown>).pages as Array<
          Record<string, unknown>
        >;
        for (const page of pages) {
          assert.equal(typeof page.path, "string");
          await access(page.path as string);
        }
      }
      const businessExportPages = (businessExport.result as Record<string, unknown>).pages as Array<
        Record<string, unknown>
      >;
      assert.deepEqual(
        businessExportPages.map((page) => page.id),
        ["cover", "contents", "highlights"],
      );

      const fontFixture = await readFile(
        resolve(repositoryRoot, "tests/fixtures/assets/codicon-subset.woff2.b64"),
        "utf8",
      );
      await writeFile(
        resolve(consumerRoot, "report.woff2"),
        Buffer.from(fontFixture.trim(), "base64"),
      );
      await writeFile(
        resolve(consumerRoot, "report.ttf"),
        Buffer.from(fontFixture.trim(), "base64"),
      );
      await writeFile(
        resolve(consumerRoot, "report.otf"),
        Buffer.from(fontFixture.trim(), "base64"),
      );
      await writeFile(
        resolve(consumerRoot, "pixel.png"),
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
          "base64",
        ),
      );
      await writeFile(
        resolve(consumerRoot, "mark.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#ff5a3c"/><circle cx="32" cy="32" r="14" fill="#fffdf7"/></svg>',
      );
      await writeFile(
        resolve(consumerRoot, "report.css"),
        `@font-face { font-family: FixtureIcon; src: url(FONT_DATA); }
@font-face { font-family: FixtureTtf; src: url(TTF_DATA); }
@font-face { font-family: FixtureOtf; src: url(OTF_DATA); }
@page { size: 10in 5.625in; margin: 0; }
* { box-sizing: border-box; }
:root { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
body { margin: 0; }
main { width: 960px; height: 540px; padding: 64px; color: #fffdf7; background: #173b2c; font-family: Arial, "Apple SD Gothic Neo", sans-serif; }
h1 { max-width: 760px; margin: 0 0 24px; font-size: 48px; line-height: 1.05; }
p { max-width: 680px; font-size: 20px; line-height: 1.45; }
.assets { display: flex; align-items: center; gap: 20px; margin-top: 28px; }
.assets img { width: 64px; height: 64px; }
.icon { font-family: FixtureIcon; font-size: 34px; }
a { color: #ff8b73; }
`,
      );
      await writeFile(
        resolve(consumerRoot, "report.tsx"),
        `import { useId } from "react";
import React, { inlineAsset, readTextAsset, type ReportComponent } from "unslide/react";

const [styles, font, ttf, otf, raster, mark] = await Promise.all([
  readTextAsset(new URL("./report.css", import.meta.url)),
  inlineAsset(new URL("./report.woff2", import.meta.url)),
  inlineAsset(new URL("./report.ttf", import.meta.url)),
  inlineAsset(new URL("./report.otf", import.meta.url)),
  inlineAsset(new URL("./pixel.png", import.meta.url)),
  inlineAsset(new URL("./mark.svg", import.meta.url)),
]);

const Report: ReportComponent = () => {
  const headingId = useId();
  return (
  <html lang="ko">
    <head>
      <meta charSet="utf-8" />
      <meta name="unslide-protocol" content="1" />
      <title>소비자 전달 보고서 / Consumer Delivery Report</title>
      <style>{styles.replace("FONT_DATA", font).replace("TTF_DATA", ttf).replace("OTF_DATA", otf)}</style>
    </head>
    <body>
      <main data-unslide-page="delivery">
        <h1 id={headingId}>소비자 전달 보고서<br />Consumer delivery report</h1>
        <p>한국어와 English text, local assets, semantic links, and authored print color survive the packaged workflow.</p>
        <div className="assets">
          <img src={raster} alt="Raster fixture" />
          <img src={mark} alt="SVG fixture" />
          <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Inline SVG"><path fill="#ff8b73" d="M32 2 62 62H2Z" /></svg>
          <span className="icon">{"\\uEA60"}</span>
          <a href="https://example.com/delivery">Delivery link</a>
        </div>
      </main>
    </body>
  </html>
  );
};
export default Report;
console.log("authored consumer output must not escape");
`,
      );

      const build = await runConsumerCli(consumerRoot, ["build", "report", "--format", "json"]);
      const buildResult = build.result as Record<string, unknown>;
      assert.equal(buildResult.kind, "build");
      const inspection = await runConsumerCli(consumerRoot, ["inspect", "report"]);
      const inspectionResult = inspection.result as Record<string, unknown>;
      assert.equal((inspectionResult.pages as unknown[]).length, 1);
      const capture = await runConsumerCli(consumerRoot, ["capture", "report"]);
      const captureResult = capture.result as Record<string, unknown>;
      assert.equal((captureResult.pages as unknown[]).length, 1);
      const exported = await runConsumerCli(consumerRoot, ["export", "report"]);
      const exportResult = exported.result as Record<string, unknown>;
      assert.equal((exportResult.pages as unknown[]).length, 1);
      const pdfInspection = await runConsumerCli(consumerRoot, ["inspect-pdf", "report"]);
      const pdfInspectionResult = pdfInspection.result as Record<string, unknown>;
      assert.equal((pdfInspectionResult.pages as unknown[]).length, 1);

      const html = await readFile(resolve(consumerRoot, "artifacts", "report.html"), "utf8");
      assert.match(html, /data-unslide-page="delivery"/);
      assert.match(html, /한국어와 English text/);
      assert.match(html, /data:image\/png;base64,/);
      assert.match(html, /data:image\/svg\+xml;base64,/);
      assert.match(html, /data:font\/woff2;base64,/);
      assert.match(html, /data:font\/ttf;base64,/);
      assert.match(html, /data:font\/otf;base64,/);
      assert.match(html, /print-color-adjust:\s*exact/);
      assert.match(html, /<svg[^>]+aria-label="Inline SVG"/);
      assert.match(html, /href="https:\/\/example\.com\/delivery"/);
      assert.doesNotMatch(html, /<script|<link[^>]+stylesheet|(?:src=["']?|url\(["']?)https?:\/\//);
      const png = await readFile(
        resolve(consumerRoot, ".tmp", "captures", "report", "page-01.png"),
      );
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [960, 540]);

      for (const [evidence, bytes] of [
        [buildResult.html, Buffer.from(html)],
        [inspectionResult.html, Buffer.from(html)],
      ] as const) {
        const file = evidence as Record<string, unknown>;
        assert.equal(file.path, resolve(canonicalConsumerRoot, "artifacts", "report.html"));
        assert.equal(file.bytes, bytes.byteLength);
        assert.equal(file.sha256, sha256(bytes));
      }
      const capturedPage = (captureResult.pages as Array<Record<string, unknown>>)[0];
      assert.equal(capturedPage?.number, 1);
      assert.equal(capturedPage?.id, "delivery");
      assert.equal(
        capturedPage?.path,
        resolve(canonicalConsumerRoot, ".tmp/captures/report/page-01.png"),
      );
      assert.equal(capturedPage?.widthPixels, 960);
      assert.equal(capturedPage?.heightPixels, 540);
      assert.equal(capturedPage?.bytes, png.byteLength);
      assert.equal(capturedPage?.sha256, sha256(png));

      const pdfPath = resolve(consumerRoot, "artifacts", "report.pdf");
      const pdfBytes = await readFile(pdfPath);
      assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
      const pdfEvidence = exportResult.pdf as Record<string, unknown>;
      assert.equal(pdfEvidence.path, resolve(canonicalConsumerRoot, "artifacts", "report.pdf"));
      assert.equal(pdfEvidence.bytes, pdfBytes.byteLength);
      assert.equal(pdfEvidence.sha256, sha256(pdfBytes));
      const exportedPage = (exportResult.pages as Array<Record<string, unknown>>)[0];
      assert.equal(exportedPage?.number, 1);
      assert.equal(exportedPage?.id, "delivery");
      assert.ok(Math.abs(Number(exportedPage?.widthPoints) - 720) <= 1);
      assert.ok(Math.abs(Number(exportedPage?.heightPoints) - 405) <= 1);
      const firstContract = await pdfContract(new Uint8Array(pdfBytes));
      assert.equal(firstContract.pageCount, 1);
      assert.ok(Math.abs(firstContract.widthPoints - 720) <= 1);
      assert.ok(Math.abs(firstContract.heightPoints - 405) <= 1);
      assert.equal(firstContract.language, "ko");
      assert.equal(firstContract.title, "소비자 전달 보고서 / Consumer Delivery Report");
      assert.equal(firstContract.creator, "Chromium");
      assert.match(String(firstContract.producer), /^Skia\/PDF/);
      assert.equal(firstContract.hasStructTree, true);
      assert.equal(firstContract.marked, true);
      assert.equal(firstContract.hasForms, false);
      assert.equal(firstContract.hasSignatures, false);
      assert.match(firstContract.outline.join(" "), /소비자 전달 보고서/);
      assert.match(firstContract.text, /한국어와\s+English text/);
      assert.deepEqual(firstContract.links, ["https://example.com/delivery"]);
      assert.match(firstContract.structure, /"role":"H1"/);

      const pdfPngPath = resolve(consumerRoot, ".tmp", "pdf-captures", "report", "page-01.png");
      const firstPdfPng = await readFile(pdfPngPath);
      assert.deepEqual([firstPdfPng.readUInt32BE(16), firstPdfPng.readUInt32BE(20)], [960, 540]);
      assert.deepEqual(await pixelAt(pdfPngPath, 10, 10), [23, 59, 44, 255]);
      const inspectedPdfPage = (pdfInspectionResult.pages as Array<Record<string, unknown>>)[0];
      assert.equal(inspectedPdfPage?.number, 1);
      assert.equal(
        inspectedPdfPage?.path,
        resolve(canonicalConsumerRoot, ".tmp/pdf-captures/report/page-01.png"),
      );
      assert.equal(inspectedPdfPage?.widthPixels, 960);
      assert.equal(inspectedPdfPage?.heightPixels, 540);
      assert.equal(inspectedPdfPage?.bytes, firstPdfPng.byteLength);
      assert.equal(inspectedPdfPage?.sha256, sha256(firstPdfPng));

      await runConsumerCli(consumerRoot, ["export", "report"]);
      await runConsumerCli(consumerRoot, ["inspect-pdf", "report"]);
      const secondContract = await pdfContract(new Uint8Array(await readFile(pdfPath)));
      assert.deepEqual(secondContract, firstContract);
      assert.equal(sha256(await readFile(pdfPngPath)), sha256(firstPdfPng));

      for (const format of ["toon", "json"] as const) {
        const failure = await runConsumerCliFailure(consumerRoot, [
          "build",
          "missing",
          "--format",
          format,
        ]);
        assert.equal(failure.resultSchemaVersion, 1);
        assert.equal(failure.status, "error");
        assert.equal((failure.error as Record<string, unknown>).code, "report-not-found");
      }

      await writeFile(
        resolve(consumerRoot, "artifacts", "report.html"),
        html.replace('name="unslide-protocol" content="1"', 'name="unslide-protocol" content="2"'),
      );
      const artifactVersion = await runConsumerCliFailure(consumerRoot, ["inspect", "report"]);
      assert.match(
        JSON.stringify(artifactVersion),
        /Unsupported artifact protocol version.*automatic migration is not available/,
      );

      const configPath = resolve(consumerRoot, "unslide.json");
      await writeFile(
        configPath,
        (await readFile(configPath, "utf8")).replace('"version": 1', '"version": 2'),
      );
      const configVersion = await runConsumerCliFailure(consumerRoot, []);
      assert.match(
        JSON.stringify(configVersion),
        /Unsupported unslide\.json version 2.*automatic migration is not available/,
      );
    } finally {
      await rm(packageDirectory, { recursive: true, force: true });
      await rm(consumerRoot, { recursive: true, force: true });
    }
  },
);
