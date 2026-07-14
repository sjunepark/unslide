import { createCanvas } from "@napi-rs/canvas";
import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Data, Effect, FileSystem, Path } from "effect";
import { commandFailure, errorMessage, mapCommandFailure } from "./failures.js";
import { onceAsync, scoped } from "./lifecycle.js";
import { logDebug, withLogPhase } from "./logging.js";
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
export const inspectPdfPages = Effect.fn("pdfInspection.inspectPdfPages")(function* (
  input: string,
  output: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const inputPath = path.resolve(input);
  const outputDirectory = path.resolve(output);
  const context = { command: "inspect-pdf", path: inputPath } as const;
  const bytes = yield* withLogPhase(
    fs.readFile(inputPath).pipe(
      Effect.mapError((cause) => commandFailure(cause, context, `Cannot read PDF ${inputPath}: ${errorMessage(cause)}`)),
    ),
    "pdf.load",
    { path: inputPath },
  );

  const pages = yield* replacePageImages(outputDirectory, "images", (stagingDirectory) => {
    const inspect = Effect.gen(function* () {
      const loading = yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            const task = getDocument({
              data: new Uint8Array(bytes),
              stopAtErrors: true,
              verbosity: VerbosityLevel.ERRORS,
            });
            return { destroy: onceAsync(() => task.destroy()), task };
          },
          catch: (cause) => new PdfInspectionFailure({
            cause,
            message: errorMessage(cause),
            phase: "load",
          }),
        }),
        ({ destroy }) => Effect.promise(destroy),
      );
      const document = yield* Effect.tryPromise({
        try: () => loading.task.promise,
        catch: (cause) => new PdfInspectionFailure({
          cause,
          message: errorMessage(cause),
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
              try: (signal) => {
                const destroy = () => {
                  void loading.destroy().catch(() => {});
                };
                signal.addEventListener("abort", destroy, { once: true });
                return document.getPage(index).finally(() => {
                  signal.removeEventListener("abort", destroy);
                });
              },
              catch: (cause) => new PdfInspectionFailure({
                cause,
                message: `Cannot load PDF page ${index}: ${errorMessage(cause)}`,
                phase: "page",
              }),
            }),
            (loadedPage) => Effect.sync(() => {
              loadedPage.cleanup();
            }),
            { interruptible: true },
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
                message: `Cannot create a canvas for PDF page ${index}: ${errorMessage(cause)}`,
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
                message: `Cannot start rendering PDF page ${index}: ${errorMessage(cause)}`,
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
              message: `Cannot render PDF page ${index}: ${errorMessage(cause)}`,
              phase: "render",
            }),
          });
          const fileName = `page-${String(index).padStart(digits, "0")}.png`;
          const png = yield* Effect.uninterruptible(Effect.tryPromise({
            try: () => canvas.encode("png"),
            catch: (cause) => new PdfInspectionFailure({
              cause,
              message: `Cannot encode PDF page ${index}: ${errorMessage(cause)}`,
              phase: "encode",
            }),
          }));
          yield* Effect.uninterruptible(fs.writeFile(
            path.resolve(stagingDirectory, fileName),
            png,
            { flag: "wx" },
          ).pipe(
            Effect.mapError((cause) => new PdfInspectionFailure({
              cause,
              message: `Cannot write PDF page ${index}: ${errorMessage(cause)}`,
              phase: "write",
            })),
          ));
          return { index, width, height, outputPath: path.resolve(outputDirectory, fileName) };
        }));
        rendered.push(renderedPage);
        yield* logDebug("page.rasterized", {
          height: renderedPage.height,
          pageIndex: renderedPage.index,
          path: renderedPage.outputPath,
          width: renderedPage.width,
        });
      }

      return rendered;
    });

    return withLogPhase(
      mapCommandFailure(
        scoped(inspect),
        context,
        (cause) => `Cannot rasterize PDF ${inputPath}: ${errorMessage(cause)}`,
      ),
      "pdf.rasterize",
      { path: inputPath },
    );
  });

  return { inputPath, outputDirectory, pages };
});
