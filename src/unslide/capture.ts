import { Effect, Path } from "effect";
import { PAGE_MARKER_SELECTOR } from "./protocol.js";
import { validateArtifactOutputPaths } from "./artifact-paths.js";
import { ArtifactOperationFailure, withLoadedArtifact } from "./browser.js";
import { mapCommandFailure } from "./failures.js";
import { logDebug, withLogPhase } from "./logging.js";
import { replacePageImages } from "./page-images.js";

export interface CapturedPage {
  id: string;
  index: number;
  width: number;
  height: number;
  outputPath: string;
}

export interface CaptureResult {
  inputPath: string;
  outputDirectory: string;
  pages: CapturedPage[];
}

export type HtmlPageSelector =
  | { readonly kind: "page-id"; readonly id: string }
  | { readonly kind: "page-number"; readonly number: number };

export const captureHtmlPages = Effect.fn("capture.captureHtmlPages")(function* (
  input: string,
  output: string,
  selector?: HtmlPageSelector,
) {
  const path = yield* Path.Path;
  const { inputPath, outputPath: outputDirectory } = yield* validateArtifactOutputPaths(
    "capture",
    input,
    output,
  );
  const context = { command: "capture", path: inputPath } as const;
  const stagedPages = yield* replacePageImages(outputDirectory, "captures", (stagingDirectory) =>
    mapCommandFailure(
      withLogPhase(
        withLoadedArtifact(inputPath, async ({ page, pages }) => {
          const digits = Math.max(2, String(pages.length).length);
          const pageElements = page.locator(PAGE_MARKER_SELECTOR);
          const selectedPages = selector
            ? pages.filter((metadata) =>
                selector.kind === "page-id"
                  ? metadata.id === selector.id
                  : metadata.index + 1 === selector.number,
              )
            : pages;
          if (selectedPages.length === 0) {
            throw new ArtifactOperationFailure({
              code: "page-selector",
              message:
                selector?.kind === "page-id"
                  ? `HTML page ID ${JSON.stringify(selector.id)} does not exist.`
                  : `HTML page number ${selector?.number} is outside the artifact's 1-${pages.length} range.`,
            });
          }

          const captures: CapturedPage[] = [];
          for (const metadata of selectedPages) {
            const element = pageElements.nth(metadata.index);
            const bounds = await element.boundingBox();
            if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
              throw new ArtifactOperationFailure({
                code: "page-geometry",
                message: `Page "${metadata.id}" at position ${metadata.index + 1} has no visible capture area.`,
                pageId: metadata.id,
              });
            }

            const fileName = `page-${String(metadata.index + 1).padStart(digits, "0")}.png`;
            const stagedPath = path.resolve(stagingDirectory, fileName);
            await element.screenshot({ path: stagedPath, animations: "disabled" });
            captures.push({
              id: metadata.id,
              index: metadata.index,
              width: Math.round(bounds.width),
              height: Math.round(bounds.height),
              outputPath: path.resolve(outputDirectory, fileName),
            });
          }
          return captures;
        }),
        "pages.capture",
        { path: inputPath },
      ),
      context,
    ),
  );

  yield* Effect.forEach(
    stagedPages,
    (page) =>
      logDebug("page.captured", {
        height: page.height,
        pageId: page.id,
        pageIndex: page.index,
        path: page.outputPath,
        width: page.width,
      }),
    { discard: true },
  );

  return { inputPath, outputDirectory, pages: stagedPages };
});
