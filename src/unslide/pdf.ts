import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Data, Effect } from "effect";
import { withLoadedArtifact } from "./browser.js";
import { runScoped, scoped, type LifecycleRunOptions } from "./lifecycle.js";
import { PAGE_MARKER_SELECTOR } from "./protocol.js";

// Chromium quantizes CSS print geometry below one point; observed absolute
// lengths can differ from their mathematical conversion by just over 0.5pt.
const GEOMETRY_TOLERANCE_POINTS = 1;

export interface PdfPage {
  index: number;
  widthPoints: number;
  heightPoints: number;
  textSample: string;
}

export interface PdfExportResult {
  inputPath: string;
  outputPath: string;
  pages: PdfPage[];
}

interface ExpectedPageText {
  index: number;
  tokens: string[];
}

interface PageGeometry {
  widthPoints: number;
  heightPoints: number;
}

class PdfValidationFailure extends Data.TaggedError("PdfValidationFailure")<{
  readonly cause?: unknown;
  readonly message: string;
  readonly phase: "load" | "page" | "text" | "validate";
}> {}

const ABSOLUTE_LENGTH_POINTS: Readonly<Record<string, number>> = {
  px: 0.75,
  in: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  q: 72 / 101.6,
  pt: 1,
  pc: 12,
};

const NAMED_PAGE_POINTS: Readonly<Record<string, readonly [number, number]>> = {
  letter: [8.5 * 72, 11 * 72],
  legal: [8.5 * 72, 14 * 72],
  ledger: [11 * 72, 17 * 72],
  a3: [297 * ABSOLUTE_LENGTH_POINTS.mm, 420 * ABSOLUTE_LENGTH_POINTS.mm],
  a4: [210 * ABSOLUTE_LENGTH_POINTS.mm, 297 * ABSOLUTE_LENGTH_POINTS.mm],
  a5: [148 * ABSOLUTE_LENGTH_POINTS.mm, 210 * ABSOLUTE_LENGTH_POINTS.mm],
  b4: [250 * ABSOLUTE_LENGTH_POINTS.mm, 353 * ABSOLUTE_LENGTH_POINTS.mm],
  b5: [176 * ABSOLUTE_LENGTH_POINTS.mm, 250 * ABSOLUTE_LENGTH_POINTS.mm],
  "jis-b4": [257 * ABSOLUTE_LENGTH_POINTS.mm, 364 * ABSOLUTE_LENGTH_POINTS.mm],
  "jis-b5": [182 * ABSOLUTE_LENGTH_POINTS.mm, 257 * ABSOLUTE_LENGTH_POINTS.mm],
};

function textTokens(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase("und").match(/[\p{L}\p{N}]+/gu) ?? [];
}

function displayGeometry(width: number, height: number): string {
  return `${width.toFixed(2)}×${height.toFixed(2)} points`;
}

function compactText(value: string): string {
  return (value.normalize("NFKC").toLocaleLowerCase("und").match(/[\p{L}\p{N}]+/gu) ?? []).join("");
}

function parseAbsoluteLength(value: string): number | undefined {
  const match = /^(?:\d+(?:\.\d*)?|\.\d+)(px|in|cm|mm|q|pt|pc)$/.exec(value);
  if (!match) return undefined;
  const points = Number.parseFloat(value) * ABSOLUTE_LENGTH_POINTS[match[1] as keyof typeof ABSOLUTE_LENGTH_POINTS];
  return Number.isFinite(points) && points > 0 ? points : undefined;
}

function parsePageGeometry(value: string): PageGeometry | undefined {
  const tokens = value.trim().toLocaleLowerCase().split(/\s+/);
  const named = NAMED_PAGE_POINTS[tokens[0] ?? ""];
  if (named && tokens.length <= 2) {
    const orientation = tokens[1];
    if (orientation && orientation !== "portrait" && orientation !== "landscape") return undefined;
    const [naturalWidth, naturalHeight] = named;
    if (orientation === "portrait") {
      return { widthPoints: Math.min(naturalWidth, naturalHeight), heightPoints: Math.max(naturalWidth, naturalHeight) };
    }
    if (orientation === "landscape") {
      return { widthPoints: Math.max(naturalWidth, naturalHeight), heightPoints: Math.min(naturalWidth, naturalHeight) };
    }
    return { widthPoints: naturalWidth, heightPoints: naturalHeight };
  }

  if (tokens.length < 1 || tokens.length > 2) return undefined;
  const lengths = tokens.map(parseAbsoluteLength);
  if (lengths.some((length) => length === undefined)) return undefined;
  const widthPoints = lengths[0];
  if (widthPoints === undefined) return undefined;
  return { widthPoints, heightPoints: lengths[1] ?? widthPoints };
}

async function validatePdf(
  bytes: Uint8Array,
  expectedPageCount: number,
  expectedGeometry: PageGeometry,
  expectedText: ExpectedPageText[],
  options: LifecycleRunOptions,
): Promise<PdfPage[]> {
  if (bytes.byteLength === 0) throw new Error("Chromium produced an empty PDF.");

  const validate = Effect.gen(function* () {
    const loadingTask = yield* Effect.acquireRelease(
      Effect.try({
        try: () => getDocument({ data: bytes, stopAtErrors: true }),
        catch: (cause) => new PdfValidationFailure({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
          phase: "load",
        }),
      }),
      (task) => Effect.promise(() => task.destroy()),
    );
    const document = yield* Effect.tryPromise({
      try: () => loadingTask.promise,
      catch: (cause) => new PdfValidationFailure({
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
        phase: "load",
      }),
    });
    if (document.numPages !== expectedPageCount) {
      return yield* new PdfValidationFailure({
        message: `PDF page count ${document.numPages} does not match the ${expectedPageCount} marked HTML pages. Check authored print page breaks and content overflow.`,
        phase: "validate",
      });
    }

    const pages: PdfPage[] = [];
    const extractedText: string[] = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const pageData = yield* scoped(Effect.gen(function* () {
        const page = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => document.getPage(index),
            catch: (cause) => new PdfValidationFailure({
              cause,
              message: `Cannot load PDF page ${index}: ${cause instanceof Error ? cause.message : String(cause)}`,
              phase: "page",
            }),
          }),
          (loadedPage) => Effect.sync(() => {
            loadedPage.cleanup();
          }),
        );
        const viewport = page.getViewport({ scale: 1 });
        const textContent = yield* Effect.tryPromise({
          try: () => page.getTextContent(),
          catch: (cause) => new PdfValidationFailure({
            cause,
            message: `Cannot extract PDF page ${index} text: ${cause instanceof Error ? cause.message : String(cause)}`,
            phase: "text",
          }),
        });
        const textItems = textContent.items
          .filter((item): item is typeof item & { str: string } => "str" in item)
          .map((item) => item.str);
        const text = textItems.join(" ");
        return {
          compactText: compactText(text),
          page: {
            index,
            widthPoints: viewport.width,
            heightPoints: viewport.height,
            textSample: text.replace(/\s+/g, " ").trim().slice(0, 120),
          },
        };
      }));
      extractedText.push(pageData.compactText);
      pages.push(pageData.page);
    }

    const first = pages[0];
    if (!first) {
      return yield* new PdfValidationFailure({
        message: "Chromium produced a PDF with no pages.",
        phase: "validate",
      });
    }
    if (
      Math.abs(first.widthPoints - expectedGeometry.widthPoints) > GEOMETRY_TOLERANCE_POINTS
      || Math.abs(first.heightPoints - expectedGeometry.heightPoints) > GEOMETRY_TOLERANCE_POINTS
    ) {
      return yield* new PdfValidationFailure({
        message: `PDF page geometry ${displayGeometry(first.widthPoints, first.heightPoints)} does not match the authored @page size ${displayGeometry(expectedGeometry.widthPoints, expectedGeometry.heightPoints)}. Refusing a possible Chromium fallback.`,
        phase: "validate",
      });
    }
    for (const page of pages.slice(1)) {
      if (
        Math.abs(page.widthPoints - first.widthPoints) > GEOMETRY_TOLERANCE_POINTS
        || Math.abs(page.heightPoints - first.heightPoints) > GEOMETRY_TOLERANCE_POINTS
      ) {
        return yield* new PdfValidationFailure({
          message: `PDF uses mixed page geometry: page 1 is ${displayGeometry(first.widthPoints, first.heightPoints)}, but page ${page.index} is ${displayGeometry(page.widthPoints, page.heightPoints)}. Initial PDF export supports one geometry per report.`,
          phase: "validate",
        });
      }
    }

    for (const expected of expectedText) {
      const actual = extractedText[expected.index - 1] ?? "";
      if (!expected.tokens.every((token) => actual.includes(compactText(token)))) {
        return yield* new PdfValidationFailure({
          message: `PDF page ${expected.index} does not preserve expected extractable text (${expected.tokens.join(" ")}). Extracted sample: ${JSON.stringify(pages[expected.index - 1]?.textSample ?? "")}. Check font embedding and authored print visibility.`,
          phase: "validate",
        });
      }
    }
    return pages;
  });

  try {
    return await runScoped(validate, options);
  } catch (error) {
    throw new Error(
      `Cannot validate generated PDF: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Prints canonical HTML with report-owned paged CSS, validates the actual PDF,
 * and publishes it only after every delivery invariant passes.
 */
export async function exportHtmlPdf(
  input: string,
  output: string,
  options: LifecycleRunOptions = {},
): Promise<PdfExportResult> {
  const inputPath = resolve(input);
  const outputPath = resolve(output);

  const printed = await withLoadedArtifact(inputPath, async ({ page, pages }) => {
    await page.emulateMedia({ media: "print" });
    const pageRules = await page.evaluate(() => {
      const baseSizes: string[] = [];
      const qualifiedSizes: string[] = [];
      const pendingRules = Array.from(document.styleSheets)
        .filter((sheet) => !sheet.disabled && (!sheet.media.mediaText || window.matchMedia(sheet.media.mediaText).matches))
        .map((sheet) => sheet.cssRules);
      while (pendingRules.length > 0) {
        const rules = pendingRules.pop();
        if (!rules) continue;
        for (const rule of rules) {
          if (rule instanceof CSSMediaRule) {
            if (window.matchMedia(rule.conditionText).matches) pendingRules.push(rule.cssRules);
            continue;
          }
          if (rule instanceof CSSSupportsRule) {
            if (CSS.supports(rule.conditionText)) pendingRules.push(rule.cssRules);
            continue;
          }
          if (rule instanceof CSSConditionRule) continue;
          if (rule instanceof CSSPageRule) {
            const size = rule.style.getPropertyValue("size").trim().toLocaleLowerCase();
            if (!size) continue;
            (rule.selectorText.trim() === "" ? baseSizes : qualifiedSizes).push(size);
          } else if ("cssRules" in rule) {
            pendingRules.push((rule as CSSGroupingRule).cssRules);
          }
        }
      }
      return {
        baseSizes: [...new Set(baseSizes)],
        qualifiedSizes: [...new Set(qualifiedSizes)],
      };
    });
    if (pageRules.baseSizes.length === 0) {
      throw new Error("Artifact print CSS must declare one active, unqualified @page rule with a concrete size; refusing Chromium's implicit Letter fallback.");
    }
    const authoredSizes = [...new Set([...pageRules.baseSizes, ...pageRules.qualifiedSizes])];
    const parsedSizes = authoredSizes.map((size) => ({ size, geometry: parsePageGeometry(size) }));
    const invalidSize = parsedSizes.find(({ geometry }) => !geometry);
    if (invalidSize) {
      throw new Error(
        `Artifact print CSS uses non-concrete @page size ${JSON.stringify(invalidSize.size)}. Use one named Chromium page format or one or two positive absolute lengths.`,
      );
    }
    const geometries = parsedSizes.map(({ geometry }) => geometry as PageGeometry);
    const expectedGeometry = geometries[0] as PageGeometry;
    if (
      geometries.some((geometry) =>
        Math.abs(geometry.widthPoints - expectedGeometry.widthPoints) > GEOMETRY_TOLERANCE_POINTS
        || Math.abs(geometry.heightPoints - expectedGeometry.heightPoints) > GEOMETRY_TOLERANCE_POINTS)
    ) {
      throw new Error(`Artifact print CSS declares ambiguous @page sizes (${authoredSizes.join(", ")}); initial PDF export supports one geometry per report.`);
    }

    const pageText = await page.locator(PAGE_MARKER_SELECTOR).allInnerTexts();
    const expectedText = pageText.flatMap((text, index) => {
      const tokens = textTokens(text).slice(0, 3);
      return tokens.length === 0 ? [] : [{ index: index + 1, tokens }];
    });
    if (expectedText.length === 0) {
      throw new Error("Artifact must contain extractable text in at least one marked page before PDF export.");
    }

    const bytes = await page.pdf({
      displayHeaderFooter: false,
      outline: true,
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
    });
    return { bytes, expectedPageCount: pages.length, expectedGeometry, expectedText };
  }, options);

  const pdfPages = await validatePdf(
    new Uint8Array(printed.bytes),
    printed.expectedPageCount,
    printed.expectedGeometry,
    printed.expectedText,
    options,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  const stagingPath = resolve(dirname(outputPath), `.unslide-pdf-${randomUUID()}-${basename(outputPath)}`);
  try {
    await writeFile(stagingPath, printed.bytes, { flag: "wx" });
    await rename(stagingPath, outputPath);
  } finally {
    await rm(stagingPath, { force: true });
  }

  return { inputPath, outputPath, pages: pdfPages };
}
