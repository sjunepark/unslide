import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
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

/** Renders the existing PDF itself; source HTML and browser state are unused. */
export async function inspectPdfPages(input: string, output: string): Promise<PdfInspectionResult> {
  const inputPath = resolve(input);
  const outputDirectory = resolve(output);
  let bytes: Buffer;
  try {
    bytes = await readFile(inputPath);
  } catch (error) {
    throw new Error(`Cannot read PDF ${inputPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const pages = await replacePageImages(outputDirectory, "images", async (stagingDirectory) => {
    const loadingTask = getDocument({
      data: new Uint8Array(bytes),
      stopAtErrors: true,
      verbosity: VerbosityLevel.ERRORS,
    });
    try {
      const document = await loadingTask.promise;
      if (document.numPages < 1) throw new Error("PDF contains no pages.");
      const digits = Math.max(2, String(document.numPages).length);
      const rendered: InspectedPdfPage[] = [];

      for (let index = 1; index <= document.numPages; index += 1) {
        const page = await document.getPage(index);
        const viewport = page.getViewport({ scale: RASTER_DPI / POINTS_PER_INCH });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        if (width < 1 || height < 1) throw new Error(`PDF page ${index} has invalid geometry ${width}×${height} pixels.`);

        const canvas = createCanvas(width, height);
        try {
          await page.render({
            canvas: canvas as unknown as HTMLCanvasElement,
            viewport,
            background: "#ffffff",
            intent: "display",
          }).promise;
          const fileName = `page-${String(index).padStart(digits, "0")}.png`;
          await writeFile(resolve(stagingDirectory, fileName), await canvas.encode("png"), { flag: "wx" });
          rendered.push({ index, width, height, outputPath: resolve(outputDirectory, fileName) });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
        }
      }

      return rendered;
    } catch (error) {
      throw new Error(`Cannot rasterize PDF ${inputPath}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await loadingTask.destroy();
    }
  });

  return { inputPath, outputDirectory, pages };
}
