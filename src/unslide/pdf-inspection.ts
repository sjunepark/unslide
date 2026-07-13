import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Data, Effect } from "effect";
import { runScoped, scoped, type LifecycleRunOptions } from "./lifecycle.js";
import { replacePageImages } from "./page-images.js";

const RASTER_DPI = 96;
const POINTS_PER_INCH = 72;

export interface InspectedPdfPage {
  index: number;
  width: number;
  height: number;
  outputPath: string;
}

export interface PdfInspectionResult {
  inputPath: string;
  outputDirectory: string;
  pages: InspectedPdfPage[];
}

class PdfInspectionFailure extends Data.TaggedError("PdfInspectionFailure")<{
  readonly cause?: unknown;
  readonly message: string;
  readonly phase: "load" | "page" | "render" | "encode" | "write" | "validate";
}> {}

/** Renders the existing PDF itself; source HTML and browser state are unused. */
export async function inspectPdfPages(
  input: string,
  output: string,
  options: LifecycleRunOptions = {},
): Promise<PdfInspectionResult> {
  const inputPath = resolve(input);
  const outputDirectory = resolve(output);
  let bytes: Buffer;
  try {
    bytes = await readFile(inputPath);
  } catch (error) {
    throw new Error(`Cannot read PDF ${inputPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const pages = await replacePageImages(outputDirectory, "images", async (stagingDirectory) => {
    const inspect = Effect.gen(function* () {
      const loadingTask = yield* Effect.acquireRelease(
        Effect.try({
          try: () => getDocument({
            data: new Uint8Array(bytes),
            stopAtErrors: true,
            verbosity: VerbosityLevel.ERRORS,
          }),
          catch: (cause) => new PdfInspectionFailure({
            cause,
            message: cause instanceof Error ? cause.message : String(cause),
            phase: "load",
          }),
        }),
        (task) => Effect.promise(() => task.destroy()),
      );
      const document = yield* Effect.tryPromise({
        try: () => loadingTask.promise,
        catch: (cause) => new PdfInspectionFailure({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
          phase: "load",
        }),
      });
      if (document.numPages < 1) {
        return yield* new PdfInspectionFailure({
          message: "PDF contains no pages.",
          phase: "validate",
        });
      }
      const digits = Math.max(2, String(document.numPages).length);
      const rendered: InspectedPdfPage[] = [];

      for (let index = 1; index <= document.numPages; index += 1) {
        const renderedPage = yield* scoped(Effect.gen(function* () {
          const page = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () => document.getPage(index),
              catch: (cause) => new PdfInspectionFailure({
                cause,
                message: `Cannot load PDF page ${index}: ${cause instanceof Error ? cause.message : String(cause)}`,
                phase: "page",
              }),
            }),
            (loadedPage) => Effect.sync(() => {
              loadedPage.cleanup();
            }),
          );
          const viewport = page.getViewport({ scale: RASTER_DPI / POINTS_PER_INCH });
          const width = Math.ceil(viewport.width);
          const height = Math.ceil(viewport.height);
          if (width < 1 || height < 1) {
            return yield* new PdfInspectionFailure({
              message: `PDF page ${index} has invalid geometry ${width}×${height} pixels.`,
              phase: "validate",
            });
          }

          const canvas = yield* Effect.acquireRelease(
            Effect.try({
              try: () => createCanvas(width, height),
              catch: (cause) => new PdfInspectionFailure({
                cause,
                message: `Cannot create a canvas for PDF page ${index}: ${cause instanceof Error ? cause.message : String(cause)}`,
                phase: "render",
              }),
            }),
            (ownedCanvas) => Effect.sync(() => {
              ownedCanvas.width = 0;
              ownedCanvas.height = 0;
            }),
          );
          const renderState = yield* Effect.acquireRelease(
            Effect.try({
              try: () => ({
                cancelled: false,
                settled: false,
                task: page.render({
                  canvas: canvas as unknown as HTMLCanvasElement,
                  viewport,
                  background: "#ffffff",
                  intent: "display",
                }),
              }),
              catch: (cause) => new PdfInspectionFailure({
                cause,
                message: `Cannot start rendering PDF page ${index}: ${cause instanceof Error ? cause.message : String(cause)}`,
                phase: "render",
              }),
            }),
            (state) => Effect.sync(() => {
              if (!state.settled && !state.cancelled) {
                state.cancelled = true;
                state.task.cancel();
              }
            }),
          );
          yield* Effect.tryPromise({
            try: () => renderState.task.promise.then(
              () => {
                renderState.settled = true;
              },
              (cause) => {
                renderState.settled = true;
                throw cause;
              },
            ),
            catch: (cause) => new PdfInspectionFailure({
              cause,
              message: `Cannot render PDF page ${index}: ${cause instanceof Error ? cause.message : String(cause)}`,
              phase: "render",
            }),
          });
          const fileName = `page-${String(index).padStart(digits, "0")}.png`;
          const png = yield* Effect.tryPromise({
            try: () => canvas.encode("png"),
            catch: (cause) => new PdfInspectionFailure({
              cause,
              message: `Cannot encode PDF page ${index}: ${cause instanceof Error ? cause.message : String(cause)}`,
              phase: "encode",
            }),
          });
          yield* Effect.tryPromise({
            try: () => writeFile(resolve(stagingDirectory, fileName), png, { flag: "wx" }),
            catch: (cause) => new PdfInspectionFailure({
              cause,
              message: `Cannot write PDF page ${index}: ${cause instanceof Error ? cause.message : String(cause)}`,
              phase: "write",
            }),
          });
          return { index, width, height, outputPath: resolve(outputDirectory, fileName) };
        }));
        rendered.push(renderedPage);
      }

      return rendered;
    });

    try {
      return await runScoped(inspect, options);
    } catch (error) {
      throw new Error(
        `Cannot rasterize PDF ${inputPath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  });

  return { inputPath, outputDirectory, pages };
}
