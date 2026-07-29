#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { accessSync, constants, realpathSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { Cause, Effect, Exit } from "effect";
import { buildReport } from "./unslide/build.js";
import { captureHtmlPages } from "./unslide/capture.js";
import {
  type CommandName,
  type OutputFormat,
  parseCommand,
  parseGlobalOptions,
  parsedCommandName,
  topHelp,
  type ParsedCommand,
} from "./unslide/cli-command.js";
import { getReport, loadProjectConfig } from "./unslide/config.js";
import {
  combineCliFailures,
  commandFailure,
  type CliFailure,
  type CommandFailure,
} from "./unslide/failures.js";
import { initializeProject, type InitResult } from "./unslide/init.js";
import { inspectHtmlArtifact } from "./unslide/inspect.js";
import { provideCliLogging, withLogPhase } from "./unslide/logging.js";
import type { ArtifactDiagnostic } from "./unslide/protocol.js";
import {
  createExecutionEvidence,
  encodeEnvelope,
  errorEnvelope,
  fileEvidence,
  pathState,
  reportState,
  successEnvelope,
  type CommandResult,
  type DiagnosticSummary,
  type ExecutionEvidence,
  type ProjectChangeFailure,
  type ProjectChangeResult,
  type ResultEnvelope,
  type ResultError,
  withStepTiming,
} from "./unslide/results.js";
import { applicationLayer } from "./unslide/runtime.js";

const LOG_LEVEL_ENV = "UNSLIDE_LOG_LEVEL";
const DEFAULT_DIAGNOSTIC_LIMIT = 10;
const DEFAULT_DIAGNOSTIC_TEXT_LIMIT = 1_000;

interface CommandOutcome {
  readonly command: CommandName;
  readonly exitCode: 0 | 1 | 2;
  readonly result?: CommandResult | ProjectChangeFailure;
  readonly error?: ResultError;
  readonly help: readonly string[];
}

interface InvocationOutput {
  readonly exitCode: 0 | 1 | 2;
  readonly envelope: ResultEnvelope;
  readonly format: OutputFormat;
}

function executablePath(): string {
  return resolve(process.env.UNSLIDE_BIN ?? process.argv[1] ?? "unslide");
}

function canonicalExecutable(path: string): string | undefined {
  try {
    accessSync(path, constants.X_OK);
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function pathResolvesToCurrentExecutable(executable: string): boolean {
  const current = canonicalExecutable(executable);
  if (!current) return false;
  return (process.env.PATH ?? "").split(delimiter).some((entry) => {
    const candidate = resolve(entry || ".", "unslide");
    return canonicalExecutable(candidate) === current;
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function commandInvocation(): string {
  if (process.env.UNSLIDE_INVOCATION) return process.env.UNSLIDE_INVOCATION;
  if (process.env.npm_lifecycle_event === "unslide") {
    const packageManager = process.env.npm_config_user_agent?.split("/")[0];
    if (packageManager === "npm") return "npm --silent run unslide";
    if (packageManager === "yarn") return "yarn --silent run unslide";
    return "pnpm --silent run unslide";
  }
  const executable = executablePath();
  return pathResolvesToCurrentExecutable(executable) ? "unslide" : shellQuote(executable);
}

const CLI_INVOCATION = commandInvocation();

function formattedInvocation(format: OutputFormat): string {
  return format === "json" ? `${CLI_INVOCATION} --format json` : CLI_INVOCATION;
}

function recoveryCommand(format: OutputFormat, command: string, value?: string): string {
  return `Run ${formattedInvocation(format)} ${command}${value ? ` ${value}` : ""}`;
}

function shellArgument(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : shellQuote(value);
}

function fullDiagnosticCommand(rawArguments: readonly string[], format: OutputFormat): string {
  const commandArguments: string[] = [];
  for (let index = 0; index < rawArguments.length; index += 1) {
    const argument = rawArguments[index] as string;
    if (argument === "--format" || argument === "--log-level") {
      index += 1;
      continue;
    }
    if (argument !== "--full") commandArguments.push(argument);
  }
  return `Run ${formattedInvocation(format)} ${commandArguments.map(shellArgument).join(" ")} --full`;
}

function truncateText(value: string): { readonly text: string; readonly totalChars?: number } {
  const characters = [...value];
  if (characters.length <= DEFAULT_DIAGNOSTIC_TEXT_LIMIT) return { text: value };
  return {
    text: `${characters.slice(0, DEFAULT_DIAGNOSTIC_TEXT_LIMIT - 1).join("")}…`,
    totalChars: characters.length,
  };
}

function diagnosticSummary(
  issues: readonly ArtifactDiagnostic[],
  full: boolean,
): DiagnosticSummary {
  const selected = full ? issues : issues.slice(0, DEFAULT_DIAGNOSTIC_LIMIT);
  let textTruncated = false;
  const rows = selected.map((issue) => {
    const message = full ? { text: issue.message } : truncateText(issue.message);
    const resource =
      issue.resource === undefined
        ? undefined
        : full
          ? { text: issue.resource }
          : truncateText(issue.resource);
    textTruncated ||= message.totalChars !== undefined || resource?.totalChars !== undefined;
    return {
      source: issue.source,
      code: issue.code,
      message: message.text,
      ...(message.totalChars === undefined ? {} : { messageTotalChars: message.totalChars }),
      ...(issue.pageId === undefined ? {} : { pageId: issue.pageId }),
      ...(resource === undefined ? {} : { resource: resource.text }),
      ...(resource?.totalChars === undefined ? {} : { resourceTotalChars: resource.totalChars }),
    };
  });
  return {
    shown: selected.length,
    total: issues.length,
    truncated: !full && (selected.length < issues.length || textTruncated),
    issues: rows,
  };
}

function authorDetail(value: string): string {
  return truncateText(value).text;
}

function commandFailureResult(
  failure: CommandFailure,
  rawArguments: readonly string[],
  format: OutputFormat,
): { readonly error: ResultError; readonly help: readonly string[] } {
  const full = rawArguments.includes("--full");
  const artifact = failure.artifact === "pdf" || failure.command === "inspect-pdf" ? "PDF" : "HTML";
  const context = {
    ...(failure.path ? { path: resolve(failure.path) } : {}),
    ...(failure.report ? { report: failure.report } : {}),
  };
  if (failure.code === "artifact-not-found") {
    return {
      error: { code: failure.code, message: `${artifact} artifact was not found.`, ...context },
      help: failure.report
        ? [recoveryCommand(format, artifact === "PDF" ? "export" : "build", failure.report)]
        : [],
    };
  }
  if (failure.code === "artifact-invalid") {
    const diagnostics =
      failure.issues && failure.issues.length > 0
        ? diagnosticSummary(failure.issues, full)
        : undefined;
    return {
      error: {
        code: failure.code,
        message: `${artifact} artifact is invalid.`,
        ...context,
        ...(failure.message ? { detail: authorDetail(failure.message) } : {}),
        ...(diagnostics ? { diagnostics } : {}),
      },
      help: [
        ...(failure.report
          ? [recoveryCommand(format, artifact === "PDF" ? "export" : "build", failure.report)]
          : []),
        ...(diagnostics?.truncated ? [fullDiagnosticCommand(rawArguments, format)] : []),
      ],
    };
  }
  if (failure.code === "browser-not-installed") {
    return {
      error: {
        code: failure.code,
        message: "The canonical Chromium browser is not installed.",
      },
      help: ["Run pnpm dlx playwright@1.61.1 install chromium"],
    };
  }
  return {
    error: {
      code: "command-failed",
      message: `${failure.command === "home" ? "Project discovery" : failure.command} failed.`,
      ...context,
      ...(failure.message ? { detail: authorDetail(failure.message) } : {}),
    },
    help: [],
  };
}

function cliFailureResult(
  failure: CliFailure,
  command: CommandName,
  rawArguments: readonly string[],
  format: OutputFormat,
): CommandOutcome {
  if (failure._tag === "ProjectNotFound") {
    return {
      command,
      exitCode: 1,
      error: {
        code: "project-not-found",
        message: `No unslide.json project configuration was found from ${failure.startDirectory}.`,
      },
      help: [recoveryCommand(format, "init")],
    };
  }
  if (failure._tag === "ProjectConfigFailure") {
    const code =
      failure.code ??
      (failure.phase === "read" ? "project-config-unreadable" : "project-config-invalid");
    const detail = failure.detail ?? failure.message;
    return {
      command,
      exitCode: 1,
      error: {
        code,
        message:
          code === "command-failed"
            ? "Project configuration loading failed."
            : code === "project-config-unreadable"
              ? "Project configuration cannot be read."
              : "Project configuration is invalid.",
        ...(code === "command-failed" ? {} : { path: resolve(failure.path) }),
        detail: authorDetail(detail),
      },
      help: [],
    };
  }
  if (failure._tag === "ReportNotFound") {
    return {
      command,
      exitCode: 1,
      error: {
        code: "report-not-found",
        message: `Report ${JSON.stringify(failure.report)} is not configured.`,
        availableReports: [...failure.availableReports],
      },
      help: [recoveryCommand(format, command === "unknown" ? "build" : command, "<name>")],
    };
  }
  if (failure._tag === "InitOperationFailure") {
    return {
      command,
      exitCode: 1,
      error: {
        code: "command-failed",
        message: "Initialization failed after completing some file work.",
        detail: authorDetail(failure.message),
        path: resolve(failure.projectRoot),
        report: failure.reportName,
      },
      result: {
        kind: "project-change",
        operation: "init",
        projectRoot: resolve(failure.projectRoot),
        report: failure.reportName,
        starter: "minimal",
        status: "failed",
        files: failure.files.map((file) => ({
          path: resolve(file.path),
          status: file.state,
        })),
      },
      help: [recoveryCommand(format, "init", `--name ${shellArgument(failure.reportName)} --yes`)],
    };
  }
  const presented = commandFailureResult(failure, rawArguments, format);
  return { command, exitCode: 1, ...presented };
}

function projectChange(result: InitResult): ProjectChangeResult {
  const base = {
    kind: "project-change",
    operation: "init",
    projectRoot: resolve(result.projectRoot),
    report: result.reportName,
    starter: "minimal",
  } as const;
  if (result.status === "planned") {
    return {
      ...base,
      status: result.status,
      files: result.files.map((file) => ({
        path: resolve(file.path),
        status: file.state as "create" | "unchanged",
      })),
    };
  }
  if (result.status === "created") {
    return {
      ...base,
      status: result.status,
      files: result.files.map((file) => ({
        path: resolve(file.path),
        status: file.state as "created" | "unchanged",
      })),
    };
  }
  return {
    ...base,
    status: "unchanged",
    files: result.files.map((file) => ({ path: resolve(file.path), status: "unchanged" })),
  };
}

const executeCommand = Effect.fn("cli.executeCommand")(function* (
  parsed: ParsedCommand,
  evidence: ExecutionEvidence,
  format: OutputFormat,
) {
  const command = parsedCommandName(parsed);
  if (parsed.kind === "help") {
    return { command, exitCode: 0, result: parsed.help, help: [] } satisfies CommandOutcome;
  }
  if (parsed.kind === "home") {
    const config = yield* withStepTiming(
      withLogPhase(loadProjectConfig(), "project.load"),
      "project.load",
      evidence,
    );
    const reports = yield* withStepTiming(
      Effect.all(Object.values(config.reports).map((report) => reportState(config, report))),
      "reports.scan",
      evidence,
    );
    const missingHtml = reports.some((report) => !report.html.exists);
    const presentHtml = reports.some((report) => report.html.exists);
    return {
      command,
      exitCode: 0,
      result: { kind: "home", projectRoot: config.projectRoot, reports },
      help: [
        ...(missingHtml ? [recoveryCommand(format, "build", "<name>")] : []),
        ...(presentHtml
          ? [
              recoveryCommand(format, "inspect", "<name>"),
              recoveryCommand(format, "capture", "<name>"),
            ]
          : []),
        ...(!presentHtml ? [recoveryCommand(format, "--help")] : []),
      ],
    } satisfies CommandOutcome;
  }
  if (parsed.kind === "init") {
    const init = yield* withStepTiming(
      withLogPhase(
        initializeProject(process.cwd(), parsed.name, parsed.write),
        parsed.write ? "project.initialize" : "project.plan",
        { report: parsed.name },
      ),
      parsed.write ? "project.initialize" : "project.plan",
      evidence,
    );
    if (init.status === "conflict") {
      const result = {
        kind: "project-change",
        operation: "init",
        projectRoot: resolve(init.projectRoot),
        report: init.reportName,
        starter: "minimal",
        status: "conflict",
        files: init.files.map((file) => ({
          path: resolve(file.path),
          status: file.state as "create" | "unchanged" | "conflict",
        })),
      } satisfies ProjectChangeFailure;
      const name = parsed.nameWasExplicit ? ` --name ${shellArgument(parsed.name)}` : "";
      return {
        command,
        exitCode: 1,
        result,
        error: {
          code: "command-failed",
          message: "Initialization would overwrite files with different contents.",
        },
        help: [
          `Run ${formattedInvocation(format)} init${name} --yes after reconciling the conflicting files`,
        ],
      } satisfies CommandOutcome;
    }
    const result = projectChange(init as InitResult);
    const name = parsed.nameWasExplicit ? ` --name ${shellArgument(parsed.name)}` : "";
    return {
      command,
      exitCode: 0,
      result,
      help:
        init.status === "planned"
          ? [`Run ${formattedInvocation(format)} init${name} --yes to create these files`]
          : [],
    } satisfies CommandOutcome;
  }

  if (parsed.kind === "inspect" && parsed.target.kind === "artifact") {
    const inspection = yield* withStepTiming(
      inspectHtmlArtifact(parsed.target.path),
      "html.inspect",
      evidence,
    );
    const html = yield* fileEvidence(inspection.inputPath);
    return {
      command,
      exitCode: 0,
      result: {
        kind: "inspect",
        html,
        pages: inspection.pages.map((page) => ({
          id: page.id,
          number: page.index + 1,
          element: page.tagName,
        })),
      },
      help: [],
    } satisfies CommandOutcome;
  }

  if (parsed.kind === "inspect-pdf" && parsed.target.kind === "artifact") {
    const target = parsed.target;
    const { inspectPdfPages } = yield* Effect.tryPromise({
      try: () => import("./unslide/pdf-inspection.js"),
      catch: (cause) =>
        commandFailure(cause, {
          command: "inspect-pdf",
          path: resolve(target.path),
        }),
    });
    const inspection = yield* withStepTiming(
      inspectPdfPages(target.path, target.output),
      "pdf.inspect",
      evidence,
    );
    const pdf = yield* fileEvidence(inspection.inputPath);
    const pages = yield* Effect.forEach(inspection.pages, (page) =>
      fileEvidence(page.outputPath).pipe(
        Effect.map((file) => ({
          number: page.index,
          path: file.path,
          widthPixels: page.width,
          heightPixels: page.height,
          bytes: file.bytes,
          sha256: file.sha256,
        })),
      ),
    );
    return {
      command,
      exitCode: 0,
      result: {
        kind: "inspect-pdf",
        pdf,
        scope: { kind: "all" },
        output: yield* pathState(inspection.outputDirectory, "directory"),
        pages,
      },
      help: [],
    } satisfies CommandOutcome;
  }

  const config = yield* withStepTiming(
    withLogPhase(loadProjectConfig(), "project.load"),
    "project.load",
    evidence,
  );
  const reportName =
    parsed.kind === "inspect"
      ? parsed.target.kind === "report"
        ? parsed.target.report
        : yield* Effect.die("Artifact inspection already handled")
      : parsed.kind === "inspect-pdf"
        ? parsed.target.kind === "report"
          ? parsed.target.report
          : yield* Effect.die("Artifact PDF inspection already handled")
        : parsed.report;
  const report = yield* getReport(config, reportName);

  if (parsed.kind === "build") {
    const built = yield* withStepTiming(buildReport(report), "report.build", evidence);
    return {
      command,
      exitCode: 0,
      result: { kind: "build", report: report.name, html: yield* fileEvidence(built.htmlPath) },
      help: [
        recoveryCommand(format, "inspect", report.name),
        recoveryCommand(format, "capture", report.name),
      ],
    } satisfies CommandOutcome;
  }
  if (parsed.kind === "inspect") {
    const inspection = yield* withStepTiming(
      inspectHtmlArtifact(report.htmlPath).pipe(
        Effect.mapError((cause) =>
          commandFailure(cause, {
            command: "inspect",
            path: report.htmlPath,
            report: report.name,
          }),
        ),
      ),
      "html.inspect",
      evidence,
    );
    return {
      command,
      exitCode: 0,
      result: {
        kind: "inspect",
        html: yield* fileEvidence(inspection.inputPath),
        pages: inspection.pages.map((page) => ({
          id: page.id,
          number: page.index + 1,
          element: page.tagName,
        })),
      },
      help: [],
    } satisfies CommandOutcome;
  }
  if (parsed.kind === "capture") {
    const capture = yield* withStepTiming(
      captureHtmlPages(report.htmlPath, report.captureDirectory).pipe(
        Effect.mapError((cause) =>
          commandFailure(cause, {
            command: "capture",
            path: report.htmlPath,
            report: report.name,
          }),
        ),
      ),
      "html.capture",
      evidence,
    );
    const pages = yield* Effect.forEach(capture.pages, (page) =>
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
    return {
      command,
      exitCode: 0,
      result: {
        kind: "capture",
        report: report.name,
        html: yield* fileEvidence(capture.inputPath),
        scope: { kind: "all" },
        output: yield* pathState(capture.outputDirectory, "directory"),
        pages,
      },
      help: [],
    } satisfies CommandOutcome;
  }
  if (parsed.kind === "export") {
    const { exportHtmlPdf } = yield* Effect.tryPromise({
      try: () => import("./unslide/pdf.js"),
      catch: (cause) =>
        commandFailure(cause, {
          command: "export",
          path: report.htmlPath,
          report: report.name,
        }),
    });
    const exported = yield* withStepTiming(
      exportHtmlPdf(report.htmlPath, report.pdfPath).pipe(
        Effect.mapError((cause) =>
          commandFailure(cause, { command: "export", report: report.name }),
        ),
      ),
      "pdf.export",
      evidence,
    );
    return {
      command,
      exitCode: 0,
      result: {
        kind: "export",
        report: report.name,
        html: yield* fileEvidence(exported.inputPath),
        pdf: yield* fileEvidence(exported.outputPath),
        pages: exported.pages.map((page) => ({
          number: page.index,
          id: page.id,
          widthPoints: page.widthPoints,
          heightPoints: page.heightPoints,
        })),
      },
      help: [recoveryCommand(format, "inspect-pdf", report.name)],
    } satisfies CommandOutcome;
  }

  const { inspectPdfPages } = yield* Effect.tryPromise({
    try: () => import("./unslide/pdf-inspection.js"),
    catch: (cause) =>
      commandFailure(cause, {
        command: "inspect-pdf",
        path: report.pdfPath,
        report: report.name,
      }),
  });
  const inspection = yield* withStepTiming(
    inspectPdfPages(report.pdfPath, report.pdfCaptureDirectory).pipe(
      Effect.mapError((cause) =>
        commandFailure(cause, {
          command: "inspect-pdf",
          path: report.pdfPath,
          report: report.name,
        }),
      ),
    ),
    "pdf.inspect",
    evidence,
  );
  const pages = yield* Effect.forEach(inspection.pages, (page) =>
    fileEvidence(page.outputPath).pipe(
      Effect.map((file) => ({
        number: page.index,
        path: file.path,
        widthPixels: page.width,
        heightPixels: page.height,
        bytes: file.bytes,
        sha256: file.sha256,
      })),
    ),
  );
  return {
    command,
    exitCode: 0,
    result: {
      kind: "inspect-pdf",
      report: report.name,
      pdf: yield* fileEvidence(inspection.inputPath),
      scope: { kind: "all" },
      output: yield* pathState(inspection.outputDirectory, "directory"),
      pages,
    },
    help: [],
  } satisfies CommandOutcome;
});

function failureLogAnnotations(cause: Cause.Cause<unknown>): Record<string, unknown> {
  const primary = cause.reasons[0];
  let errorTag = "Unknown";
  if (primary?._tag === "Fail") {
    const error = primary.error;
    errorTag =
      typeof error === "object" &&
      error !== null &&
      "_tag" in error &&
      typeof error._tag === "string"
        ? error._tag
        : "Failure";
  } else if (primary?._tag === "Die") {
    errorTag = "Defect";
  } else if (primary?._tag === "Interrupt") {
    errorTag = "Interrupt";
  }
  const errorMessage =
    {
      CommandFailure: "Command operation failed.",
      Defect: "Unexpected defect.",
      Failure: "Operation failed.",
      Interrupt: "Operation interrupted.",
      ProjectConfigFailure: "Project configuration failed.",
      ProjectNotFound: "Project discovery failed.",
      ReportNotFound: "Report lookup failed.",
      InitOperationFailure: "Project initialization failed.",
      Unknown: "Operation failed.",
    }[errorTag] ?? "Operation failed.";
  return { errorMessage, errorTag };
}

function instrumentInvocation<E, R>(
  effect: Effect.Effect<CommandOutcome, E, R>,
  command: CommandName,
): Effect.Effect<CommandOutcome, E, R> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("invocation.started");
    return yield* effect.pipe(
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          if (Exit.isFailure(exit)) {
            yield* Effect.logError("invocation.failed").pipe(
              Effect.annotateLogs(failureLogAnnotations(exit.cause)),
            );
            yield* Effect.logDebug("failure.cause", exit.cause);
          } else if (exit.value.exitCode === 0) {
            yield* Effect.logInfo("invocation.completed").pipe(Effect.annotateLogs("exitCode", 0));
          } else if (exit.value.exitCode === 2) {
            yield* Effect.logWarning("invocation.rejected").pipe(
              Effect.annotateLogs("exitCode", 2),
            );
          } else {
            yield* Effect.logError("invocation.failed").pipe(
              Effect.annotateLogs("exitCode", exit.value.exitCode),
            );
          }
        }),
      ),
    );
  }).pipe(
    Effect.annotateLogs({ command, invocationId: randomUUID() }),
    Effect.withLogSpan("invocation"),
  );
}

async function main(rawArguments: readonly string[]): Promise<InvocationOutput> {
  const global = parseGlobalOptions(rawArguments, process.env[LOG_LEVEL_ENV]);
  const evidence = createExecutionEvidence();
  if (!global.ok) {
    return {
      exitCode: 2,
      format: global.format,
      envelope: errorEnvelope(
        global.command,
        { code: "usage", message: global.message },
        evidence,
        [`Run ${topHelp(formattedInvocation(global.format)).examples[0] as string}`],
      ),
    };
  }

  const parsed = parseCommand(global.value.argv, formattedInvocation(global.value.format));
  if (!parsed.ok) {
    const outcome: CommandOutcome = {
      command: parsed.command,
      exitCode: 2,
      error: { code: "usage", message: parsed.message },
      help: parsed.help,
    };
    const program = provideCliLogging(
      instrumentInvocation(Effect.succeed(outcome), parsed.command),
      global.value.logLevel,
    ).pipe(Effect.provide(applicationLayer));
    const resolved = await Effect.runPromise(program);
    return {
      exitCode: 2,
      format: global.value.format,
      envelope: errorEnvelope(
        resolved.command,
        resolved.error as ResultError,
        evidence,
        resolved.help,
      ),
    };
  }

  const command = parsedCommandName(parsed.value);
  const program = provideCliLogging(
    instrumentInvocation(executeCommand(parsed.value, evidence, global.value.format), command),
    global.value.logLevel,
  ).pipe(Effect.provide(applicationLayer));
  const exit = await Effect.runPromiseExit(program);
  let outcome: CommandOutcome;
  if (Exit.isSuccess(exit)) {
    outcome = exit.value;
  } else {
    const failure = combineCliFailures(exit.cause);
    outcome = failure
      ? cliFailureResult(failure, command, rawArguments, global.value.format)
      : {
          command,
          exitCode: 1,
          error: { code: "command-failed", message: "The command failed unexpectedly." },
          help: [],
        };
  }
  return {
    exitCode: outcome.exitCode,
    format: global.value.format,
    envelope:
      outcome.exitCode === 0
        ? successEnvelope(outcome.command, outcome.result as CommandResult, evidence, outcome.help)
        : errorEnvelope(
            outcome.command,
            outcome.error as ResultError,
            evidence,
            outcome.help,
            outcome.result as ProjectChangeFailure | undefined,
          ),
  };
}

const output = await main(process.argv.slice(2));
await new Promise<void>((resolveWrite, rejectWrite) => {
  process.stdout.write(encodeEnvelope(output.format, output.envelope), (error) => {
    if (error) rejectWrite(error);
    else resolveWrite();
  });
});
// Report modules are trusted but may leave timers behind. All owned resources
// are closed before presentation, so terminate after result and log streams flush.
await new Promise<void>((resolveWrite, rejectWrite) => {
  process.stderr.write("", (error) => {
    if (error) rejectWrite(error);
    else resolveWrite();
  });
});
process.exit(output.exitCode);
