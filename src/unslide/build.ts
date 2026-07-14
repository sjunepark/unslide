import { isValidElement } from "react";
import { tsImport } from "tsx/esm/api";
import { Effect } from "effect";
import type { ReportConfig } from "./config.js";
import { commandFailure } from "./failures.js";
import { writeReportHtml } from "./render.js";

export interface BuildResult {
  name: string;
  htmlPath: string;
}

export const buildReport = Effect.fn("build.buildReport")(function* (report: ReportConfig) {
  const context = { command: "build", path: report.sourcePath, report: report.name } as const;
  const entryModule = yield* Effect.tryPromise({
    try: () => tsImport(report.sourcePath, import.meta.url) as Promise<Record<string, unknown>>,
    catch: (cause) => commandFailure(
      cause,
      context,
      `Cannot load source for report "${report.name}": ${cause instanceof Error ? cause.message : String(cause)}`,
    ),
  });

  if (!isValidElement(entryModule.default)) {
    return yield* commandFailure(
      new Error("Invalid report source export"),
      context,
      `Report "${report.name}" source must export one complete React document as its default export.`,
    );
  }

  yield* writeReportHtml({ document: entryModule.default, outputPath: report.htmlPath }).pipe(
    Effect.mapError((cause) => commandFailure(cause, context)),
  );
  return { name: report.name, htmlPath: report.htmlPath };
});
