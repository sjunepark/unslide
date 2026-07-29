import { access } from "node:fs/promises";
import { createElement, isValidElement, type ReactElement } from "react";
import { tsImport } from "tsx/esm/api";
import { Effect } from "effect";
import type { ReportConfig } from "./config.js";
import { commandFailure, isMissingFileError } from "./failures.js";
import { withLogPhase } from "./logging.js";
import type { ReportComponent } from "./react.js";
import { writeReportHtml } from "./render.js";
import { captureReportConsole } from "./source-console.js";

export interface BuildResult {
  name: string;
  htmlPath: string;
}

const functionSource = Function.prototype.toString;

function isClassExport(value: Function): boolean {
  const prototype = value.prototype as { readonly isReactComponent?: unknown } | undefined;
  return (
    prototype?.isReactComponent !== undefined || /^\s*class\s/.test(functionSource.call(value))
  );
}

function isAsyncExport(value: Function): boolean {
  return Object.prototype.toString.call(value) === "[object AsyncFunction]";
}

function reactObjectKind(value: object): "lazy" | "memo" | undefined {
  if (!("$$typeof" in value) || typeof value.$$typeof !== "symbol") return undefined;
  const key = Symbol.keyFor(value.$$typeof);
  if (key === "react.lazy") return "lazy";
  if (key === "react.memo") return "memo";
  return undefined;
}

function invalidExportReason(value: unknown): string | undefined {
  if (value === undefined) return "The default export is missing.";
  if (value === null) return "The default export is null.";

  if (typeof value === "function") {
    if (isClassExport(value)) return "Class components are unsupported.";
    if (isAsyncExport(value)) return "Async components are unsupported.";
    if (value.length > 0) {
      return "The exported component declares required parameters, but Unslide passes no props.";
    }
    return undefined;
  }

  if (typeof value === "object") {
    if ("then" in value && typeof value.then === "function") {
      return "Promise exports are unsupported.";
    }
    const reactKind = reactObjectKind(value);
    if (reactKind) return `React ${reactKind} exports are unsupported.`;
    return "The default export is an unsupported object.";
  }

  return `The default export is an unsupported ${typeof value}.`;
}

function sourceDocument(
  value: unknown,
): { readonly document: ReactElement } | { readonly reason: string } {
  if (isValidElement(value)) return { document: value };
  const reason = invalidExportReason(value);
  if (reason) return { reason };
  return { document: createElement(value as ReportComponent) };
}

const buildReportUncaptured = Effect.fn("build.buildReportUncaptured")(function* (
  report: ReportConfig,
) {
  const context = { command: "build", path: report.sourcePath, report: report.name } as const;
  yield* Effect.tryPromise({
    try: () => access(report.sourcePath),
    catch: (cause) =>
      isMissingFileError(cause)
        ? commandFailure(
            cause,
            { ...context, code: "source-not-found" },
            `Report "${report.name}" source does not exist: ${report.sourcePath}`,
          )
        : commandFailure(cause, context),
  });
  const entryModule = yield* withLogPhase(
    captureReportConsole(
      Effect.tryPromise({
        try: () => tsImport(report.sourcePath, import.meta.url) as Promise<Record<string, unknown>>,
        catch: (cause) =>
          commandFailure(
            cause,
            context,
            `Cannot load source for report "${report.name}": ${cause instanceof Error ? cause.message : String(cause)}`,
          ),
      }),
      "source-evaluation",
      report.name,
    ),
    "source.load",
    { path: report.sourcePath, report: report.name },
  );

  const source = sourceDocument(entryModule.default);
  if ("reason" in source) {
    return yield* commandFailure(
      new Error("Invalid report source export"),
      context,
      `Report "${report.name}" source must export one complete React document as either a React element or a synchronous zero-prop function component. ${source.reason}`,
    );
  }

  yield* writeReportHtml({ document: source.document, outputPath: report.htmlPath }).pipe(
    Effect.mapError((cause) => commandFailure(cause, context)),
  );
  return { name: report.name, htmlPath: report.htmlPath };
});

export const buildReport = Effect.fn("build.buildReport")(function* (report: ReportConfig) {
  return yield* captureReportConsole(
    buildReportUncaptured(report),
    "source-evaluation",
    report.name,
  );
});
