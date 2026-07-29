import { Cause, Clock, Effect, Exit } from "effect";
import { buildReport } from "./build.js";
import { captureHtmlPages, type HtmlPageSelector } from "./capture.js";
import type { ReportConfig } from "./config.js";
import {
  combineCliFailures,
  commandFailure,
  mapCommandFailure,
  type CliFailure,
} from "./failures.js";
import { inspectHtmlArtifact } from "./inspect.js";
import { publishReviewManifest } from "./review-manifest.js";
import {
  createExecutionEvidence,
  fileEvidence,
  pathState,
  toolVersion,
  withStepTiming,
  type CapturedHtmlPage,
  type CapturedPdfPage,
  type ExecutionEvidence,
  type ExportedPdfPage,
  type FileEvidence,
  type HtmlScopePage,
  type PathState,
  type PublishedStep,
  type RequestedReviewScope,
  type ReviewManifest,
  type ReviewPage,
  type ScopeAll,
} from "./results.js";

export interface ReviewOptions {
  readonly pdf: boolean;
  readonly selector?: HtmlPageSelector;
}

interface ReviewAttemptBase {
  readonly report: string;
  readonly requestedScope: RequestedReviewScope;
  readonly scope?: ScopeAll | HtmlScopePage;
  readonly html?: FileEvidence;
  readonly pdf?: FileEvidence;
  readonly pages: ReviewPage[];
  readonly steps: PublishedStep[];
  readonly evidence: ExecutionEvidence;
}

export type ReviewAttempt =
  | (ReviewAttemptBase & {
      readonly status: "ok";
      readonly scope: ScopeAll | HtmlScopePage;
      readonly html: FileEvidence;
      readonly manifest: FileEvidence;
    })
  | (ReviewAttemptBase & {
      readonly status: "error";
      readonly failure: CliFailure;
      readonly manifestState: PathState;
    });

function requestedScope(selector: HtmlPageSelector | undefined): RequestedReviewScope {
  return selector ?? { kind: "all" };
}

function trackedStep<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  step: string,
  published: boolean,
  evidence: ExecutionEvidence,
  steps: PublishedStep[],
): Effect.Effect<A, E, R> {
  return withStepTiming(effect, step, evidence).pipe(
    Effect.onExit((exit) =>
      Effect.sync(() => {
        steps.push(
          Exit.isSuccess(exit)
            ? { step, status: "completed", published }
            : { step, status: "failed", published: false },
        );
      }),
    ),
  );
}

function publicationStep<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  step: string,
  steps: PublishedStep[],
): Effect.Effect<A, E, R> {
  return effect.pipe(
    Effect.onExit((exit) =>
      Effect.sync(() => {
        steps.push(
          Exit.isSuccess(exit)
            ? { step, status: "completed", published: true }
            : { step, status: "failed", published: false },
        );
      }),
    ),
  );
}

function resolveScope(
  pages: readonly { readonly id: string; readonly index: number }[],
  selector: HtmlPageSelector | undefined,
  report: ReportConfig,
): Effect.Effect<ScopeAll | HtmlScopePage, ReturnType<typeof commandFailure>> {
  if (!selector) return Effect.succeed({ kind: "all" });
  const page = pages.find((entry) =>
    selector.kind === "page-id" ? entry.id === selector.id : entry.index + 1 === selector.number,
  );
  if (!page) {
    return Effect.fail(
      commandFailure(
        new Error("Review page selector does not match the HTML artifact"),
        { command: "review", code: "usage", path: report.htmlPath, report: report.name },
        selector.kind === "page-id"
          ? `HTML page ID ${JSON.stringify(selector.id)} does not exist.`
          : `HTML page number ${selector.number} is outside the artifact's 1-${pages.length} range.`,
      ),
    );
  }
  return Effect.succeed({ kind: "page", id: page.id, number: page.index + 1 });
}

function capturedHtmlEvidence(page: CapturedHtmlPage) {
  return {
    path: page.path,
    bytes: page.bytes,
    sha256: page.sha256,
    widthPixels: page.widthPixels,
    heightPixels: page.heightPixels,
  };
}

function capturedPdfEvidence(page: CapturedPdfPage) {
  return {
    path: page.path,
    bytes: page.bytes,
    sha256: page.sha256,
    widthPixels: page.widthPixels,
    heightPixels: page.heightPixels,
  };
}

function reviewPages(
  inspected: readonly { readonly id: string; readonly index: number }[],
  scope: ScopeAll | HtmlScopePage,
  htmlCaptures: readonly CapturedHtmlPage[],
  pdfPages: readonly ExportedPdfPage[] = [],
  pdfCaptures: readonly CapturedPdfPage[] = [],
): ReviewPage[] {
  return inspected.map((page) => {
    const number = page.index + 1;
    const selected = scope.kind === "all" || scope.number === number;
    const geometry = pdfPages.find((entry) => entry.number === number);
    const base = {
      id: page.id,
      number,
      ...(geometry
        ? {
            pdfGeometry: {
              widthPoints: geometry.widthPoints,
              heightPoints: geometry.heightPoints,
            },
          }
        : {}),
    };
    if (!selected) return { ...base, selected: false };
    const htmlCapture = htmlCaptures.find((entry) => entry.number === number);
    if (!htmlCapture) throw new Error(`Missing HTML capture evidence for page ${number}`);
    const pdfCapture = pdfCaptures.find((entry) => entry.number === number);
    return {
      ...base,
      selected: true,
      htmlCapture: capturedHtmlEvidence(htmlCapture),
      ...(pdfCapture ? { pdfCapture: capturedPdfEvidence(pdfCapture) } : {}),
    };
  });
}

export const reviewReport = Effect.fn("review.reviewReport")(function* (
  report: ReportConfig,
  options: ReviewOptions,
) {
  const evidence = createExecutionEvidence();
  const steps: PublishedStep[] = [];
  const requested = requestedScope(options.selector);
  let scope: ScopeAll | HtmlScopePage | undefined;
  let html: FileEvidence | undefined;
  let pdf: FileEvidence | undefined;
  let pages: ReviewPage[] = [];

  const workflow = Effect.gen(function* () {
    const built = yield* trackedStep(
      buildReport(report).pipe(
        Effect.mapError((cause) =>
          commandFailure(cause, {
            command: "review",
            path: report.sourcePath,
            report: report.name,
          }),
        ),
      ),
      "report.build",
      true,
      evidence,
      steps,
    );
    html = yield* fileEvidence(built.htmlPath);

    const inspected = yield* trackedStep(
      Effect.gen(function* () {
        const result = yield* inspectHtmlArtifact(report.htmlPath).pipe(
          Effect.mapError((cause) =>
            commandFailure(cause, {
              command: "review",
              path: report.htmlPath,
              report: report.name,
            }),
          ),
        );
        scope = yield* resolveScope(result.pages, options.selector, report);
        return result;
      }),
      "html.inspect",
      false,
      evidence,
      steps,
    );

    const captured = yield* trackedStep(
      captureHtmlPages(report.htmlPath, report.captureDirectory, options.selector).pipe(
        Effect.mapError((cause) =>
          commandFailure(cause, { command: "review", path: report.htmlPath, report: report.name }),
        ),
      ),
      "html.capture",
      true,
      evidence,
      steps,
    );
    const htmlCaptures = yield* Effect.forEach(captured.pages, (page) =>
      fileEvidence(page.outputPath).pipe(
        Effect.map((file) => ({
          id: page.id,
          number: page.index + 1,
          path: file.path,
          widthPixels: page.width,
          heightPixels: page.height,
          bytes: file.bytes,
          sha256: file.sha256,
        })),
      ),
    );
    pages = reviewPages(inspected.pages, scope as ScopeAll | HtmlScopePage, htmlCaptures);

    let exportedPages: ExportedPdfPage[] = [];
    let pdfCaptures: CapturedPdfPage[] = [];
    if (options.pdf) {
      const [{ exportHtmlPdf }, { inspectPdfPages }] = yield* Effect.all([
        Effect.tryPromise({
          try: () => import("./pdf.js"),
          catch: (cause) => commandFailure(cause, { command: "review", report: report.name }),
        }),
        Effect.tryPromise({
          try: () => import("./pdf-inspection.js"),
          catch: (cause) => commandFailure(cause, { command: "review", report: report.name }),
        }),
      ]);
      const exported = yield* trackedStep(
        exportHtmlPdf(report.htmlPath, report.pdfPath).pipe(
          Effect.mapError((cause) =>
            commandFailure(cause, {
              command: "review",
              path: report.htmlPath,
              report: report.name,
            }),
          ),
        ),
        "pdf.export",
        true,
        evidence,
        steps,
      );
      pdf = yield* fileEvidence(exported.outputPath);
      exportedPages = exported.pages.map((page) => ({
        number: page.index,
        id: page.id,
        widthPoints: page.widthPoints,
        heightPoints: page.heightPoints,
      }));
      pages = reviewPages(
        inspected.pages,
        scope as ScopeAll | HtmlScopePage,
        htmlCaptures,
        exportedPages,
      );

      const inspectedPdf = yield* trackedStep(
        inspectPdfPages(
          report.pdfPath,
          report.pdfCaptureDirectory,
          scope?.kind === "page" ? scope.number : undefined,
        ).pipe(
          Effect.mapError((cause) =>
            commandFailure(cause, {
              artifact: "pdf",
              command: "review",
              path: report.pdfPath,
              report: report.name,
            }),
          ),
        ),
        "pdf.inspect",
        true,
        evidence,
        steps,
      );
      pdfCaptures = yield* Effect.forEach(inspectedPdf.pages, (page) =>
        fileEvidence(page.outputPath).pipe(
          Effect.map((file) => ({
            number: page.index,
            id: inspected.pages[page.index - 1]?.id,
            path: file.path,
            widthPixels: page.width,
            heightPixels: page.height,
            bytes: file.bytes,
            sha256: file.sha256,
          })),
        ),
      );
      pages = reviewPages(
        inspected.pages,
        scope as ScopeAll | HtmlScopePage,
        htmlCaptures,
        exportedPages,
        pdfCaptures,
      );
    }

    yield* trackedStep(
      Effect.sync(() => pages),
      "manifest.prepare",
      false,
      evidence,
      steps,
    );
    const manifest: ReviewManifest = {
      manifestSchemaVersion: 1,
      resultSchemaVersion: 1,
      toolVersion,
      report: report.name,
      createdAt: new Date(yield* Clock.currentTimeMillis).toISOString(),
      scope: scope as ScopeAll | HtmlScopePage,
      html: html as FileEvidence,
      ...(pdf ? { pdf } : {}),
      pages,
      warnings: [...evidence.warnings],
      timings: [...evidence.timings],
    };
    return yield* publicationStep(
      publishReviewManifest(report.manifestPath, manifest),
      "manifest.publish",
      steps,
    );
  });

  const exit = yield* Effect.exit(
    mapCommandFailure(workflow, { command: "review", report: report.name }),
  );
  if (Exit.isSuccess(exit)) {
    return {
      status: "ok",
      report: report.name,
      requestedScope: requested,
      scope: scope as ScopeAll | HtmlScopePage,
      html: html as FileEvidence,
      ...(pdf ? { pdf } : {}),
      pages,
      steps,
      evidence,
      manifest: exit.value,
    } satisfies ReviewAttempt;
  }
  const failure = combineCliFailures(exit.cause);
  if (!failure) return yield* Effect.failCause(exit.cause as Cause.Cause<CliFailure>);
  return {
    status: "error",
    report: report.name,
    requestedScope: requested,
    ...(scope ? { scope } : {}),
    ...(html ? { html } : {}),
    ...(pdf ? { pdf } : {}),
    pages,
    steps,
    evidence,
    failure,
    manifestState: yield* pathState(report.manifestPath, "file"),
  } satisfies ReviewAttempt;
});
