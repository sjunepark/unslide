import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { encode } from "@toon-format/toon";
import { Clock, Effect, Exit, FileSystem, Option } from "effect";
import type { CommandName, HelpResult, OutputFormat } from "./cli-command.js";
import type { ProjectConfig, ReportConfig } from "./config.js";
import { pathsOverlap } from "./paths.js";

const packageJson = createRequire(import.meta.url)("../../package.json") as { version: string };

export interface ResultError {
  readonly code: string;
  readonly message: string;
  readonly detail?: string;
  readonly path?: string;
  readonly report?: string;
  readonly availableReports?: readonly string[];
  readonly diagnostics?: DiagnosticSummary;
}

export interface DiagnosticSummary {
  readonly shown: number;
  readonly total: number;
  readonly truncated: boolean;
  readonly issues: ReadonlyArray<{
    readonly source: string;
    readonly code: string;
    readonly message: string;
    readonly messageTotalChars?: number;
    readonly pageId?: string;
    readonly resource?: string;
    readonly resourceTotalChars?: number;
  }>;
}

export interface ResultWarning {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly pageId?: string;
}

export interface StepTiming {
  readonly step: string;
  readonly status: "completed" | "failed";
  readonly durationMs: number;
}

export interface ExecutionEvidence {
  readonly warnings: ResultWarning[];
  readonly timings: StepTiming[];
}

export function createExecutionEvidence(): ExecutionEvidence {
  return { warnings: [], timings: [] };
}

export function withStepTiming<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  step: string,
  evidence: ExecutionEvidence,
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeNanos;
    return yield* effect.pipe(
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          const finished = yield* Clock.currentTimeNanos;
          evidence.timings.push({
            step,
            status: Exit.isSuccess(exit) ? "completed" : "failed",
            durationMs: Math.max(0, Number((finished - started) / 1_000_000n)),
          });
        }),
      ),
    );
  });
}

export interface MissingPathState {
  readonly kind: "file" | "directory";
  readonly path: string;
  readonly exists: false;
}

export interface PresentPathState {
  readonly kind: "file" | "directory";
  readonly path: string;
  readonly exists: true;
  readonly modifiedAt: string;
}

export type PathState = MissingPathState | PresentPathState;

export interface FileEvidence {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface InspectedHtmlPage {
  readonly id: string;
  readonly number: number;
  readonly element: string;
}

export interface CapturedHtmlPage {
  readonly id: string;
  readonly number: number;
  readonly path: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ExportedPdfPage {
  readonly number: number;
  readonly id: string;
  readonly widthPoints: number;
  readonly heightPoints: number;
}

export interface CapturedPdfPage {
  readonly number: number;
  readonly id?: string;
  readonly path: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ScopeAll {
  readonly kind: "all";
}

export interface ReportState {
  readonly name: string;
  readonly source: PathState;
  readonly html: PathState;
  readonly pdf: PathState;
  readonly captures: PathState;
  readonly pdfCaptures: PathState;
  readonly manifest: PathState;
}

interface ProjectChangeBase<
  FileStatus extends string,
  Operation extends "init" | "add" = "init" | "add",
> {
  readonly kind: "project-change";
  readonly operation: Operation;
  readonly projectRoot: string;
  readonly report: string;
  readonly starter: "minimal" | "business-report";
  readonly files: ReadonlyArray<{ readonly path: string; readonly status: FileStatus }>;
}

export type ProjectChangeResult =
  | (ProjectChangeBase<"create" | "unchanged"> & { readonly status: "planned" })
  | (ProjectChangeBase<"created" | "unchanged"> & { readonly status: "created" })
  | (ProjectChangeBase<"unchanged"> & { readonly status: "unchanged" });

export type ProjectChangeFailure =
  | (ProjectChangeBase<"create" | "unchanged" | "conflict"> & {
      readonly status: "conflict";
    })
  | (ProjectChangeBase<"created" | "unchanged" | "failed" | "not-started", "init"> & {
      readonly status: "failed";
    });

export type CommandResult =
  | { readonly kind: "home"; readonly projectRoot: string; readonly reports: ReportState[] }
  | HelpResult
  | ProjectChangeResult
  | { readonly kind: "build"; readonly report: string; readonly html: FileEvidence }
  | { readonly kind: "inspect"; readonly html: FileEvidence; readonly pages: InspectedHtmlPage[] }
  | {
      readonly kind: "capture";
      readonly report: string;
      readonly html: FileEvidence;
      readonly scope: ScopeAll;
      readonly output: PathState;
      readonly pages: CapturedHtmlPage[];
    }
  | {
      readonly kind: "export";
      readonly report: string;
      readonly html: FileEvidence;
      readonly pdf: FileEvidence;
      readonly pages: ExportedPdfPage[];
    }
  | {
      readonly kind: "inspect-pdf";
      readonly report?: string;
      readonly pdf: FileEvidence;
      readonly scope: ScopeAll;
      readonly output: PathState;
      readonly pages: CapturedPdfPage[];
    };

export interface ResultEnvelopeBase {
  readonly resultSchemaVersion: 1;
  readonly toolVersion: string;
  readonly command: CommandName;
  readonly warnings: readonly ResultWarning[];
  readonly timings: readonly StepTiming[];
  readonly help: readonly string[];
}

export type ResultEnvelope =
  | (ResultEnvelopeBase & { readonly status: "ok"; readonly result: CommandResult })
  | (ResultEnvelopeBase & {
      readonly status: "error";
      readonly error: ResultError;
      readonly result?: ProjectChangeFailure;
    });

export function successEnvelope(
  command: CommandName,
  result: CommandResult,
  evidence: ExecutionEvidence,
  help: readonly string[] = [],
): ResultEnvelope {
  return {
    resultSchemaVersion: 1,
    toolVersion: packageJson.version,
    command,
    status: "ok",
    result,
    warnings: evidence.warnings,
    timings: evidence.timings,
    help,
  };
}

export function errorEnvelope(
  command: CommandName,
  error: ResultError,
  evidence: ExecutionEvidence,
  help: readonly string[] = [],
  result?: ProjectChangeFailure,
): ResultEnvelope {
  return {
    resultSchemaVersion: 1,
    toolVersion: packageJson.version,
    command,
    status: "error",
    error,
    ...(result === undefined ? {} : { result }),
    warnings: evidence.warnings,
    timings: evidence.timings,
    help,
  };
}

export function encodeEnvelope(format: OutputFormat, envelope: ResultEnvelope): string {
  const encoded = format === "json" ? JSON.stringify(envelope) : encode(envelope);
  return `${encoded}\n`;
}

export function writeEnvelope(format: OutputFormat, envelope: ResultEnvelope): void {
  process.stdout.write(encodeEnvelope(format, envelope));
}

export const fileEvidence = Effect.fn("results.fileEvidence")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const absolutePath = resolve(path);
  const bytes = yield* fs.readFile(absolutePath);
  return {
    path: absolutePath,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  } satisfies FileEvidence;
});

export const pathState = Effect.fn("results.pathState")(function* (
  path: string,
  kind: "file" | "directory",
) {
  const fs = yield* FileSystem.FileSystem;
  const absolutePath = resolve(path);
  if (!(yield* fs.exists(absolutePath))) {
    return { kind, path: absolutePath, exists: false } satisfies MissingPathState;
  }
  const info = yield* fs.stat(absolutePath);
  const modifiedAt = Option.getOrThrow(info.mtime);
  return {
    kind,
    path: absolutePath,
    exists: true,
    modifiedAt: modifiedAt.toISOString(),
  } satisfies PresentPathState;
});

/** Derives a stable manifest location without invalidating an existing v1 path. */
export function reviewManifestPath(config: ProjectConfig, report: ReportConfig): string {
  const occupied = Object.values(config.reports).flatMap((entry) => [
    entry.sourcePath,
    entry.htmlPath,
    entry.pdfPath,
    entry.captureDirectory,
    entry.pdfCaptureDirectory,
  ]);
  const stem = report.htmlPath.replace(/\.html$/, ".review");
  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${stem}${suffix === 1 ? "" : `-${suffix}`}.json`;
    if (occupied.every((path) => !pathsOverlap(candidate, path))) return candidate;
  }
}

export const reportState = Effect.fn("results.reportState")(function* (
  config: ProjectConfig,
  report: ReportConfig,
) {
  const [source, html, pdf, captures, pdfCaptures, manifest] = yield* Effect.all([
    pathState(report.sourcePath, "file"),
    pathState(report.htmlPath, "file"),
    pathState(report.pdfPath, "file"),
    pathState(report.captureDirectory, "directory"),
    pathState(report.pdfCaptureDirectory, "directory"),
    pathState(reviewManifestPath(config, report), "file"),
  ]);
  return { name: report.name, source, html, pdf, captures, pdfCaptures, manifest };
});
