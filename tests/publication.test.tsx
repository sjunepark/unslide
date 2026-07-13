import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import test from "node:test";
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";
import { Effect, Exit, FileSystem, Layer, PlatformError, type Path } from "effect";
import { commandFailure } from "../src/unslide/failures.js";
import { initializeProject } from "../src/unslide/init.js";
import { causeMessage } from "../src/unslide/lifecycle.js";
import { replacePageImages } from "../src/unslide/page-images.js";
import { exportHtmlPdf } from "../src/unslide/pdf.js";
import { writeReportHtml } from "../src/unslide/render.js";

type AppLayer = Layer.Layer<FileSystem.FileSystem | Path.Path>;

function systemFailure(method: string, path: string, message: string) {
  const cause = new Error(message);
  return PlatformError.systemError({
    _tag: "Unknown",
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
    description: message,
    cause,
  });
}

async function liveFileSystem(): Promise<FileSystem.FileSystem> {
  return Effect.runPromise(FileSystem.FileSystem.pipe(Effect.provide(NodeFileSystem.layer)));
}

function layerWithFileSystem(fs: FileSystem.FileSystem): AppLayer {
  return Layer.merge(Layer.succeed(FileSystem.FileSystem)(fs), NodePath.layer);
}

async function runWithLayer<A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
  layer: AppLayer,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect.pipe(Effect.provide(layer)));
  if (exit._tag === "Success") return exit.value;
  throw new Error(causeMessage(exit.cause), { cause: exit.cause });
}

function runExitWithLayer<A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
  layer: AppLayer,
) {
  return Effect.runPromiseExit(effect.pipe(Effect.provide(layer)));
}

function pdfArtifact(text: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="unslide-protocol" content="1">
    <style>@page{size:4in 3in;margin:0}body{margin:0}</style>
  </head>
  <body><main data-unslide-page="one">${text}</main></body>
</html>`;
}

test("HTML publication keeps the prior artifact when atomic rename fails", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide html publication "));
  const outputPath = resolve(directory, "report.html");
  try {
    await writeFile(outputPath, "prior HTML delivery");
    const live = await liveFileSystem();
    const injected: FileSystem.FileSystem = {
      ...live,
      rename: (from, to) => to === outputPath
        ? Effect.fail(systemFailure("rename", from, "fixture HTML rename failed"))
        : live.rename(from, to),
    };

    await assert.rejects(
      runWithLayer(writeReportHtml({
        document: <html><body><main data-unslide-page="one">New report</main></body></html>,
        outputPath,
      }), layerWithFileSystem(injected)),
      /fixture HTML rename failed/,
    );
    assert.equal(await readFile(outputPath, "utf8"), "prior HTML delivery");
    assert.deepEqual(await readdir(directory), ["report.html"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("initialization reports partial creation without deleting safe user-visible files", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide init partial "));
  try {
    const live = await liveFileSystem();
    const injected: FileSystem.FileSystem = {
      ...live,
      writeFileString: (path, data, options) => path.endsWith("report.tsx")
        ? Effect.fail(systemFailure("writeFileString", path, "fixture scaffold write failed"))
        : live.writeFileString(path, data, options),
    };

    await assert.rejects(
      runWithLayer(initializeProject(directory, "report", true), layerWithFileSystem(injected)),
      /these safely created files remain: unslide\.json.*fixture scaffold write failed/,
    );
    assert.match(await readFile(resolve(directory, "unslide.json"), "utf8"), /"version": 1/);
    assert.deepEqual(await readdir(directory), ["unslide.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("initialization preserves a defect while retaining partial-creation evidence", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide init defect "));
  try {
    const live = await liveFileSystem();
    const injected: FileSystem.FileSystem = {
      ...live,
      writeFileString: (path, data, options) => path.endsWith("report.tsx")
        ? Effect.die(new Error("fixture init defect"))
        : live.writeFileString(path, data, options),
    };

    const exit = await runExitWithLayer(
      initializeProject(directory, "report", true),
      layerWithFileSystem(injected),
    );
    assert.ok(Exit.isFailure(exit));
    assert.ok(exit.cause.reasons.some((reason) => reason._tag === "Die"));
    assert.match(causeMessage(exit.cause), /fixture init defect/);
    assert.match(causeMessage(exit.cause), /these safely created files remain: unslide\.json/);
    assert.match(await readFile(resolve(directory, "unslide.json"), "utf8"), /"version": 1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("incomplete page-image rollback retains exact recovery staging", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide rollback evidence "));
  const outputDirectory = resolve(directory, "captures");
  try {
    const live = await liveFileSystem();
    await mkdir(outputDirectory);
    await writeFile(resolve(outputDirectory, "page-01.png"), "prior page one");
    await writeFile(resolve(outputDirectory, "page-02.png"), "prior page two");
    await writeFile(resolve(outputDirectory, "keep.txt"), "unrelated");

    const injected: FileSystem.FileSystem = {
      ...live,
      rename: (from, to) => {
        if (basename(dirname(from)).startsWith(".unslide-page-images-") && basename(from) === "page-02.png") {
          return Effect.fail(systemFailure("rename", from, "fixture publish rename failed"));
        }
        if (basename(dirname(from)) === "previous" && basename(from) === "page-01.png") {
          return Effect.fail(systemFailure("rename", from, "fixture rollback restore failed"));
        }
        return live.rename(from, to);
      },
    };

    await assert.rejects(
      runWithLayer(
        replacePageImages(outputDirectory, "captures", (stagingDirectory) => Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.writeFileString(resolve(stagingDirectory, "page-01.png"), "new page one", { flag: "wx" });
          yield* fs.writeFileString(resolve(stagingDirectory, "page-02.png"), "new page two", { flag: "wx" });
          return [
            { outputPath: resolve(outputDirectory, "page-01.png") },
            { outputPath: resolve(outputDirectory, "page-02.png") },
          ];
        }).pipe(
          Effect.mapError((cause) => commandFailure(cause, { command: "capture", path: outputDirectory })),
        )),
        layerWithFileSystem(injected),
      ),
      /rollback was incomplete[\s\S]*fixture rollback restore failed[\s\S]*fixture publish rename failed/,
    );

    const entries = await readdir(outputDirectory);
    const stagingName = entries.find((name) => name.startsWith(".unslide-page-images-"));
    assert.ok(stagingName, "recovery staging should remain after incomplete rollback");
    const stagingDirectory = resolve(outputDirectory, stagingName);
    assert.equal(await readFile(resolve(stagingDirectory, "previous", "page-01.png"), "utf8"), "prior page one");
    assert.equal(await readFile(resolve(stagingDirectory, "page-02.png"), "utf8"), "new page two");
    assert.equal(await readFile(resolve(outputDirectory, "page-02.png"), "utf8"), "prior page two");
    assert.equal(await readFile(resolve(outputDirectory, "keep.txt"), "utf8"), "unrelated");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("page-image cleanup failure remains diagnosable with the primary failure", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide cleanup evidence "));
  try {
    const live = await liveFileSystem();
    const injected: FileSystem.FileSystem = {
      ...live,
      remove: (path, options) => basename(path).startsWith(".unslide-page-images-")
        ? Effect.fail(systemFailure("remove", path, "fixture staging cleanup failed"))
        : live.remove(path, options),
    };

    await assert.rejects(
      runWithLayer(
        replacePageImages(directory, "captures", () => Effect.fail(commandFailure(
          new Error("fixture generation failed"),
          { command: "capture", path: directory },
        ))),
        layerWithFileSystem(injected),
      ),
      /fixture generation failed[\s\S]*Cleanup failed: fixture staging cleanup failed/,
    );
    assert.ok((await readdir(directory)).some((name) => name.startsWith(".unslide-page-images-")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("page-image publication restores prior files without reclassifying interruption", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide interrupted publication "));
  try {
    await writeFile(resolve(directory, "page-01.png"), "prior page one");
    const live = await liveFileSystem();
    const injected: FileSystem.FileSystem = {
      ...live,
      rename: (from, to) => basename(dirname(from)).startsWith(".unslide-page-images-")
        && basename(from) === "page-01.png"
        ? Effect.interrupt
        : live.rename(from, to),
    };

    const exit = await runExitWithLayer(
      replacePageImages(directory, "captures", (stagingDirectory) => Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(resolve(stagingDirectory, "page-01.png"), "new page one", { flag: "wx" });
        return [{ outputPath: resolve(directory, "page-01.png") }];
      }).pipe(
        Effect.mapError((cause) => commandFailure(cause, { command: "capture", path: directory })),
      )),
      layerWithFileSystem(injected),
    );
    assert.ok(Exit.isFailure(exit));
    assert.ok(exit.cause.reasons.some((reason) => reason._tag === "Interrupt"));
    assert.equal(await readFile(resolve(directory, "page-01.png"), "utf8"), "prior page one");
    assert.equal((await readdir(directory)).some((name) => name.startsWith(".unslide-page-images-")), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF publication keeps the prior artifact when atomic rename fails", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide pdf publication "));
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  try {
    await writeFile(inputPath, pdfArtifact("Atomic PDF publication"));
    await writeFile(outputPath, "prior PDF delivery");
    const live = await liveFileSystem();
    const injected: FileSystem.FileSystem = {
      ...live,
      rename: (from, to) => to === outputPath
        ? Effect.fail(systemFailure("rename", from, "fixture PDF rename failed"))
        : live.rename(from, to),
    };

    await assert.rejects(
      runWithLayer(exportHtmlPdf(inputPath, outputPath), layerWithFileSystem(injected)),
      /fixture PDF rename failed/,
    );
    assert.equal(await readFile(outputPath, "utf8"), "prior PDF delivery");
    assert.equal((await readdir(directory)).some((name) => name.startsWith(".unslide-pdf-")), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF publication retains cleanup failure evidence with the primary failure", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "unslide pdf cleanup evidence "));
  const inputPath = resolve(directory, "report.html");
  const outputPath = resolve(directory, "report.pdf");
  try {
    await writeFile(inputPath, pdfArtifact("PDF cleanup evidence"));
    await writeFile(outputPath, "prior PDF delivery");
    const live = await liveFileSystem();
    const injected: FileSystem.FileSystem = {
      ...live,
      rename: (from, to) => to === outputPath
        ? Effect.fail(systemFailure("rename", from, "fixture PDF rename failed"))
        : live.rename(from, to),
      remove: (path, options) => basename(path).startsWith(".unslide-pdf-")
        ? Effect.fail(systemFailure("remove", path, "fixture PDF cleanup failed"))
        : live.remove(path, options),
    };

    await assert.rejects(
      runWithLayer(exportHtmlPdf(inputPath, outputPath), layerWithFileSystem(injected)),
      /fixture PDF rename failed[\s\S]*Cleanup failed: fixture PDF cleanup failed/,
    );
    assert.equal(await readFile(outputPath, "utf8"), "prior PDF delivery");
    assert.equal((await readdir(directory)).some((name) => name.startsWith(".unslide-pdf-")), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
