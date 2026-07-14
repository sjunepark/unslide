#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { accessSync, constants, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, relative, resolve, sep } from "node:path";
import { encode } from "@toon-format/toon";
import { Cause, Effect, Exit, FileSystem } from "effect";
import { buildReport } from "./unslide/build.js";
import { captureHtmlPages } from "./unslide/capture.js";
import { getReport, loadProjectConfig, type ProjectConfig } from "./unslide/config.js";
import { commandFailure, CommandFailure, type CliFailure } from "./unslide/failures.js";
import { initializeProject } from "./unslide/init.js";
import { inspectHtmlArtifact } from "./unslide/inspect.js";
import { causeMessage } from "./unslide/lifecycle.js";
import {
  type CliLogLevel,
  provideCliLogging,
  withLogPhase,
} from "./unslide/logging.js";
import type { ArtifactDiagnostic } from "./unslide/protocol.js";
import { applicationLayer } from "./unslide/runtime.js";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const LOG_LEVEL_FLAG = "--log-level";
const LOG_LEVEL_ENV = "UNSLIDE_LOG_LEVEL";
const LOG_LEVELS = new Set<CliLogLevel>(["off", "info", "debug"]);
const DEFAULT_DIAGNOSTIC_LIMIT = 10;
const DEFAULT_DIAGNOSTIC_TEXT_LIMIT = 1_000;

interface ParsedLoggingOptions {
  argv: string[];
  level: CliLogLevel;
}

type LoggingOptionsResult =
  | { ok: true; value: ParsedLoggingOptions }
  | { message: string; ok: false };

function writeOutput(value: JsonValue): void {
  process.stdout.write(encode(value));
}

function executablePath(): string {
  return resolve(process.env.UNSLIDE_BIN ?? process.argv[1] ?? "unslide");
}

function displayExecutable(): string {
  const executable = executablePath();
  const home = homedir();
  return executable.startsWith(`${home}${sep}`) ? `~${executable.slice(home.length)}` : executable;
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
  if (process.env.npm_lifecycle_event === "unslide") return "pnpm --silent run unslide";
  const executable = executablePath();
  return pathResolvesToCurrentExecutable(executable) ? "unslide" : shellQuote(executable);
}

const CLI_INVOCATION = commandInvocation();

function helpFlag(): JsonValue {
  return {
    flag: "--help",
    description: "Show concise command help without requiring command values",
  };
}

function logLevelFlag(): JsonValue {
  return {
    flag: `${LOG_LEVEL_FLAG} <off|info|debug>`,
    description: `Emit Effect JSON Lines on stderr (default: ${LOG_LEVEL_ENV} or off)`,
  };
}

function fullFlag(): JsonValue {
  return {
    flag: "--full",
    description: "Show complete report-authored diagnostics (default: up to 10 issues and 1,000 characters per text field)",
  };
}

function parseLogLevel(value: string): CliLogLevel | undefined {
  return LOG_LEVELS.has(value as CliLogLevel) ? value as CliLogLevel : undefined;
}

function parseLoggingOptions(argv: string[], environmentValue: string | undefined): LoggingOptionsResult {
  const joinedFlag = argv.find((argument) => argument.startsWith(`${LOG_LEVEL_FLAG}=`));
  if (joinedFlag) {
    return { message: `Use ${LOG_LEVEL_FLAG} <off|info|debug> with a separate value.`, ok: false };
  }

  const indexes = argv.flatMap((argument, index) => argument === LOG_LEVEL_FLAG ? [index] : []);
  if (indexes.length > 1) {
    return { message: `${LOG_LEVEL_FLAG} may be provided only once.`, ok: false };
  }

  if (indexes.length === 1) {
    const index = indexes[0] as number;
    const rawLevel = argv[index + 1];
    if (!rawLevel || rawLevel.startsWith("-")) {
      return { message: `${LOG_LEVEL_FLAG} requires one of: off, info, debug.`, ok: false };
    }
    const level = parseLogLevel(rawLevel);
    if (!level) {
      return { message: `Invalid ${LOG_LEVEL_FLAG} value ${JSON.stringify(rawLevel)}; expected off, info, or debug.`, ok: false };
    }
    return {
      ok: true,
      value: {
        argv: argv.filter((_, argumentIndex) => argumentIndex !== index && argumentIndex !== index + 1),
        level,
      },
    };
  }

  if (environmentValue !== undefined) {
    const level = parseLogLevel(environmentValue);
    if (!level) {
      return { message: `Invalid ${LOG_LEVEL_ENV} value ${JSON.stringify(environmentValue)}; expected off, info, or debug.`, ok: false };
    }
    return { ok: true, value: { argv: [...argv], level } };
  }
  return { ok: true, value: { argv: [...argv], level: "off" } };
}

function topHelp(): JsonValue {
  return {
    bin: displayExecutable(),
    description: "Build and inspect explicit-page HTML and PDF reports",
    usage: `${CLI_INVOCATION} <command>`,
    flags: [helpFlag(), logLevelFlag()],
    commands: [
      { command: "build <name>", description: "Build a named report to standalone HTML" },
      { command: "inspect <name>", description: "Validate a named report's existing HTML artifact" },
      { command: "inspect --artifact <path>", description: "Validate any existing HTML artifact" },
      { command: "capture <name>", description: "Capture a named report's HTML pages" },
      { command: "export <name>", description: "Export a named report's existing HTML artifact to PDF" },
      { command: "inspect-pdf <name>", description: "Render a named report's existing PDF to page images" },
      { command: "inspect-pdf --artifact <path> --output <directory>", description: "Render any existing PDF to page images" },
      { command: "init", description: "Plan or create a minimal report project" },
    ],
    help: [`Run ${CLI_INVOCATION} <command> --help for command details`],
  };
}

function commandHelp(command: "build" | "inspect" | "capture" | "export" | "inspect-pdf" | "init"): JsonValue {
  if (command === "init") {
    return {
      command: "init",
      usage: `${CLI_INVOCATION} init [--name <name>] [--yes]`,
      flags: [
        { flag: "--name <name>", description: "Set the lower-kebab report name (default: report)" },
        { flag: "--yes", description: "Create the planned files without prompting" },
        helpFlag(),
        logLevelFlag(),
      ],
      examples: [`${CLI_INVOCATION} init`, `${CLI_INVOCATION} init --yes`, `${CLI_INVOCATION} init --name quarterly-review --yes`],
    };
  }
  if (command === "inspect") {
    return {
      command: "inspect",
      usage: `${CLI_INVOCATION} inspect <name> | ${CLI_INVOCATION} inspect --artifact <path>`,
      flags: [
        { flag: "--artifact <path>", description: "Inspect an explicit HTML path instead of a configured report" },
        fullFlag(),
        helpFlag(),
        logLevelFlag(),
      ],
      examples: [`${CLI_INVOCATION} inspect operating-review`, `${CLI_INVOCATION} inspect --artifact artifacts/report.html`],
    };
  }
  if (command === "capture" || command === "export") {
    return {
      command,
      usage: `${CLI_INVOCATION} ${command} <name>`,
      flags: [fullFlag(), helpFlag(), logLevelFlag()],
      examples: [`${CLI_INVOCATION} ${command} spike`, `${CLI_INVOCATION} ${command} operating-review`],
    };
  }
  if (command === "inspect-pdf") {
    return {
      command: "inspect-pdf",
      usage: `${CLI_INVOCATION} inspect-pdf <name> | ${CLI_INVOCATION} inspect-pdf --artifact <path> --output <directory>`,
      flags: [
        { flag: "--artifact <path>", description: "Inspect an explicit PDF path instead of a configured report" },
        { flag: "--output <directory>", description: "Write explicit-artifact page images to this directory" },
        helpFlag(),
        logLevelFlag(),
      ],
      examples: [
        `${CLI_INVOCATION} inspect-pdf operating-review`,
        `${CLI_INVOCATION} inspect-pdf --artifact artifacts/report.pdf --output .tmp/pdf-captures/report`,
      ],
    };
  }
  return {
    command,
    usage: `${CLI_INVOCATION} ${command} <name>`,
    flags: [helpFlag(), logLevelFlag()],
    examples: [`${CLI_INVOCATION} ${command} spike`, `${CLI_INVOCATION} ${command} operating-review`],
  };
}

function usageError(message: string, help: JsonValue): number {
  writeOutput({ error: { code: "usage", message }, help });
  return 2;
}

function defectError(): number {
  writeOutput({ error: { code: "command-failed", message: "The command failed unexpectedly." } });
  return 1;
}

function recoveryCommand(command: string, report: string): string {
  return `${CLI_INVOCATION} ${command} ${report}`;
}

function recognizedCommand(rawArguments: string[]): CliCommand | undefined {
  return rawArguments.find((argument): argument is CliCommand =>
    argument === "build"
    || argument === "inspect"
    || argument === "capture"
    || argument === "export"
    || argument === "inspect-pdf"
    || argument === "init");
}

function shellArgument(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : shellQuote(value);
}

function fullDiagnosticCommand(rawArguments: string[]): string {
  const commandArguments: string[] = [];
  for (let index = 0; index < rawArguments.length; index += 1) {
    const argument = rawArguments[index] as string;
    if (argument === LOG_LEVEL_FLAG) {
      index += 1;
      continue;
    }
    if (argument !== "--full") commandArguments.push(argument);
  }
  return `${CLI_INVOCATION} ${commandArguments.map(shellArgument).join(" ")} --full`;
}

interface DiagnosticView {
  readonly output: JsonValue;
  readonly truncated: boolean;
}

function truncateDiagnosticText(value: string): { text: string; totalChars?: number } {
  const characters = [...value];
  if (characters.length <= DEFAULT_DIAGNOSTIC_TEXT_LIMIT) return { text: value };
  return {
    text: `${characters.slice(0, DEFAULT_DIAGNOSTIC_TEXT_LIMIT - 1).join("")}…`,
    totalChars: characters.length,
  };
}

function diagnosticView(issues: readonly ArtifactDiagnostic[], full: boolean): DiagnosticView {
  const selected = full ? issues : issues.slice(0, DEFAULT_DIAGNOSTIC_LIMIT);
  let textTruncated = false;
  const rows = selected.map((issue) => {
    const message = full ? { text: issue.message } : truncateDiagnosticText(issue.message);
    const resource = issue.resource === undefined
      ? undefined
      : full ? { text: issue.resource } : truncateDiagnosticText(issue.resource);
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
  const truncated = !full && (issues.length > selected.length || textTruncated);
  return {
    output: {
      shown: selected.length,
      total: issues.length,
      truncated,
      issues: rows,
    },
    truncated,
  };
}

function artifactKind(command: string): "HTML" | "PDF" {
  return command === "inspect-pdf" ? "PDF" : "HTML";
}

function formatCommandFailure(error: CommandFailure, rawArguments: string[]): void {
  const kind = artifactKind(error.command);
  const context = {
    ...(error.report ? { report: error.report } : {}),
    ...(error.path ? { path: error.path } : {}),
  };
  if (error.code === "artifact-not-found") {
    writeOutput({
      error: { code: error.code, message: `${kind} artifact was not found.`, ...context },
      ...(error.report
        ? { help: [`Run ${recoveryCommand(kind === "PDF" ? "export" : "build", error.report)}`] }
        : {}),
    });
    return;
  }
  if (error.code === "artifact-invalid") {
    const diagnostics = error.issues && error.issues.length > 0
      ? diagnosticView(error.issues, rawArguments.includes("--full"))
      : undefined;
    const help = [
      ...(error.report ? [`Run ${recoveryCommand(kind === "PDF" ? "export" : "build", error.report)}`] : []),
      ...(diagnostics?.truncated ? [`Run ${fullDiagnosticCommand(rawArguments)}`] : []),
    ];
    writeOutput({
      error: { code: error.code, message: `${kind} artifact is invalid.`, ...context },
      ...(diagnostics ? { diagnostics: diagnostics.output } : {}),
      ...(help.length > 0 ? { help } : {}),
    });
    return;
  }
  if (error.code === "browser-not-installed") {
    writeOutput({
      error: { code: error.code, message: "The canonical Chromium browser is not installed." },
      help: ["Run pnpm dlx playwright@1.61.1 install chromium"],
    });
    return;
  }
  writeOutput({
    error: {
      code: "command-failed",
      message: `${error.command === "home" ? "Project discovery" : error.command} failed.`,
      ...context,
    },
  });
}

function formatCliFailure(error: CliFailure, rawArguments: string[]): number {
  switch (error._tag) {
    case "ProjectNotFound":
      writeOutput({
        error: {
          code: "project-not-found",
          message: `No unslide.json project configuration was found from ${error.startDirectory}.`,
        },
        help: [`Run ${CLI_INVOCATION} init to plan a new project`],
      });
      return 1;
    case "ProjectConfigFailure": {
      const code = error.code ?? (error.phase === "read" ? "project-config-unreadable" : "project-config-invalid");
      if (code === "command-failed") {
        writeOutput({ error: { code, message: "Project configuration loading failed." } });
      } else {
        writeOutput({
          error: {
            code,
            message: code === "project-config-unreadable"
              ? "Project configuration cannot be read."
              : "Project configuration is invalid.",
            path: error.path,
            ...(error.detail || (code === "project-config-invalid" && error.cause === undefined)
              ? { detail: error.detail ?? error.message }
              : {}),
          },
        });
      }
      return 1;
    }
    case "ReportNotFound": {
      const command = recognizedCommand(rawArguments) ?? "build";
      const presentationSuffix = rawArguments.includes("--full") ? " --full" : "";
      writeOutput({
        error: {
          code: "report-not-found",
          message: `Report "${error.report}" is not configured.`,
          availableReports: [...error.availableReports],
        },
        help: [`Run ${recoveryCommand(command, "<name>")}${presentationSuffix}`],
      });
      return 1;
    }
    case "CommandFailure":
      formatCommandFailure(error, rawArguments);
      return 1;
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}

function isCliFailure(error: unknown): error is CliFailure {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return false;
  return error._tag === "ProjectNotFound"
    || error._tag === "ProjectConfigFailure"
    || error._tag === "ReportNotFound"
    || error._tag === "CommandFailure";
}

function projectPath(config: ProjectConfig, absolutePath: string): string {
  return relative(config.projectRoot, absolutePath) || ".";
}

type CliCommand = "build" | "inspect" | "capture" | "export" | "inspect-pdf" | "init";

function validateBeforeHelp(command: CliCommand, argv: string[]): string | undefined {
  const allowedFlags = command === "inspect"
    ? new Set(["--artifact", "--full", "--help"])
    : command === "inspect-pdf"
      ? new Set(["--artifact", "--output", "--help"])
      : command === "init"
        ? new Set(["--name", "--yes", "--help"])
        : command === "capture" || command === "export"
          ? new Set(["--full", "--help"])
          : new Set(["--help"]);
  const unknownFlag = argv.slice(1).find((argument) => argument.startsWith("-") && !allowedFlags.has(argument));
  if (unknownFlag) return `Unknown flag "${unknownFlag}" for ${command}.`;

  const helpCount = argv.filter((argument) => argument === "--help").length;
  if (helpCount > 1) return "--help may be provided only once.";
  const fullCount = argv.filter((argument) => argument === "--full").length;
  if (fullCount > 1) return "--full may be provided only once.";

  if (command === "build" || command === "capture" || command === "export") {
    const positionals = argv.slice(1).filter((argument) => argument !== "--help" && argument !== "--full");
    return positionals.length > 1
      ? `Unexpected argument "${positionals[1]}" for ${command}.`
      : undefined;
  }

  if (command === "init") {
    let nameSeen = false;
    let yesSeen = false;
    for (let index = 1; index < argv.length; index += 1) {
      const argument = argv[index];
      if (argument === "--help") continue;
      if (argument === "--yes") {
        if (yesSeen) return "--yes may be provided only once.";
        yesSeen = true;
        continue;
      }
      if (argument === "--name") {
        if (nameSeen) return "--name may be provided only once.";
        nameSeen = true;
        const value = argv[index + 1];
        if (value && !value.startsWith("-")) {
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
            return `Invalid report name "${value}"; use lower-kebab case.`;
          }
          index += 1;
        }
        continue;
      }
      return `Unexpected argument "${argument}" for init.`;
    }
    return undefined;
  }

  const valueFlags = command === "inspect" ? ["--artifact"] : ["--artifact", "--output"];
  const seen = new Set<string>();
  const positionals: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--help" || argument === "--full") continue;
    if (valueFlags.includes(argument)) {
      if (seen.has(argument)) return `${argument} may be provided only once.`;
      seen.add(argument);
      const value = argv[index + 1];
      if (value && !value.startsWith("-")) index += 1;
      continue;
    }
    positionals.push(argument);
  }
  if (positionals.length > 1) return `Unexpected argument "${positionals[1]}" for ${command}.`;
  if (positionals.length === 1 && seen.size > 0) {
    return `${command} accepts either one report name or explicit artifact flags, not both.`;
  }
  return undefined;
}

const home = Effect.fn("cli.home")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const config = yield* withLogPhase(loadProjectConfig(), "project.load");
  const reports = yield* withLogPhase(
    Effect.all(Object.values(config.reports).map((report) => fs.exists(report.htmlPath).pipe(
      Effect.map((exists) => ({
        name: report.name,
        source: projectPath(config, report.sourcePath),
        html: projectPath(config, report.htmlPath),
        status: exists ? "built" : "not-built",
      })),
      Effect.mapError((cause) => commandFailure(cause, { command: "home", path: report.htmlPath, report: report.name })),
    ))),
    "reports.scan",
    { project: config.projectRoot },
  );
  writeOutput({
    bin: displayExecutable(),
    description: "Build and inspect explicit-page HTML and PDF reports",
    project: config.projectRoot,
    reports,
    help: [`Run ${CLI_INVOCATION} build <name>`, `Run ${CLI_INVOCATION} inspect <name>`, `Run ${CLI_INVOCATION} capture <name>`, `Run ${CLI_INVOCATION} export <name>`, `Run ${CLI_INVOCATION} inspect-pdf <name>`],
  });
  return 0;
});

const runCommand = Effect.fn("cli.runCommand")(function* (argv: string[]) {
  if (argv.length === 0) return yield* home();
  if (argv[0] === "--help") {
    if (argv.length > 1) return usageError(`Unexpected argument "${argv[1]}" for --help.`, topHelp());
    writeOutput(topHelp());
    return 0;
  }

  const command = argv[0];
  if (command !== "build" && command !== "inspect" && command !== "capture" && command !== "export" && command !== "inspect-pdf" && command !== "init") {
    return usageError(`Unknown command "${command}".`, topHelp());
  }
  const validationError = validateBeforeHelp(command, argv);
  if (validationError) return usageError(validationError, commandHelp(command));
  if (argv.includes("--help")) {
    writeOutput(commandHelp(command));
    return 0;
  }
  argv = argv.filter((argument) => argument !== "--full");

  if (command === "init") {
    let reportName = "report";
    let write = false;
    let nameSeen = false;
    let yesSeen = false;
    for (let index = 1; index < argv.length; index += 1) {
      const argument = argv[index];
      if (argument === "--yes") {
        if (yesSeen) return usageError("--yes may be provided only once.", commandHelp("init"));
        yesSeen = true;
        write = true;
        continue;
      }
      if (argument === "--name") {
        if (nameSeen) return usageError("--name may be provided only once.", commandHelp("init"));
        const value = argv[index + 1];
        if (!value || value.startsWith("-")) return usageError("--name requires one value.", commandHelp("init"));
        nameSeen = true;
        reportName = value;
        index += 1;
        continue;
      }
      return usageError(`Unexpected argument "${argument}" for init.`, commandHelp("init"));
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(reportName)) {
      return usageError(`Invalid report name "${reportName}"; use lower-kebab case.`, commandHelp("init"));
    }

    const result = yield* withLogPhase(
      initializeProject(process.cwd(), reportName, write),
      write ? "project.initialize" : "project.plan",
      { report: reportName },
    );
    const init = {
      root: result.projectRoot,
      report: result.reportName,
      status: result.status,
      files: result.files.map((file) => ({ path: file.relativePath, status: file.state })),
    };
    if (result.status === "conflict") {
      writeOutput({
        error: { code: "command-failed", message: "Initialization would overwrite files with different contents." },
        init,
        help: [`Run ${CLI_INVOCATION} init${nameSeen ? ` --name ${reportName}` : ""} --yes after reconciling the conflicting files`],
      });
      return 1;
    }
    writeOutput({
      init,
      ...(result.status === "planned" ? { help: [`Run ${CLI_INVOCATION} init${nameSeen ? ` --name ${reportName}` : ""} --yes to create these files`] } : {}),
    });
    return 0;
  }

  if (command === "inspect" && argv[1] === "--artifact") {
    if (argv.length !== 3 || !argv[2]) {
      return usageError("--artifact requires exactly one HTML path.", commandHelp("inspect"));
    }
    const result = yield* inspectHtmlArtifact(argv[2] as string);
    writeOutput({
      artifact: { path: result.inputPath, pageCount: result.pages.length },
      pages: result.pages.map((page) => ({ index: page.index, id: page.id, element: page.tagName })),
    });
    return 0;
  }

  if (command === "inspect-pdf" && argv.includes("--artifact")) {
    const artifactIndex = argv.indexOf("--artifact");
    const outputIndex = argv.indexOf("--output");
    const artifactPath = argv[artifactIndex + 1];
    const outputDirectory = argv[outputIndex + 1];
    if (
      argv.length !== 5
      || artifactIndex < 1
      || outputIndex < 1
      || !artifactPath
      || artifactPath.startsWith("-")
      || !outputDirectory
      || outputDirectory.startsWith("-")
    ) {
      return usageError("Explicit PDF inspection requires --artifact <path> and --output <directory> exactly once.", commandHelp("inspect-pdf"));
    }
    const { inspectPdfPages } = yield* Effect.tryPromise({
      try: () => import("./unslide/pdf-inspection.js"),
      catch: (cause) => commandFailure(cause, { command: "inspect-pdf", path: artifactPath }),
    });
    const result = yield* inspectPdfPages(artifactPath, outputDirectory);
    writeOutput({
      pdf: { path: result.inputPath, output: result.outputDirectory, pageCount: result.pages.length },
      pages: result.pages.map((page) => ({ index: page.index, file: page.outputPath, width: page.width, height: page.height })),
    });
    return 0;
  }

  if (argv.length !== 2 || !argv[1]) {
    return usageError(`${command} requires exactly one report name.`, commandHelp(command));
  }

  const config = yield* withLogPhase(loadProjectConfig(), "project.load");
  const report = yield* getReport(config, argv[1]);
  if (command === "build") {
    const result = yield* buildReport(report);
    writeOutput({ report: { name: result.name, status: "built", html: projectPath(config, result.htmlPath) } });
    return 0;
  }
  if (command === "inspect") {
    const result = yield* inspectHtmlArtifact(report.htmlPath).pipe(
      Effect.mapError((cause) => commandFailure(cause, {
        command,
        path: report.htmlPath,
        report: report.name,
      })),
    );
    writeOutput({
      report: { name: report.name, status: "valid", html: projectPath(config, result.inputPath), pageCount: result.pages.length },
      pages: result.pages.map((page) => ({ index: page.index, id: page.id, element: page.tagName })),
    });
    return 0;
  }

  if (command === "export") {
    const { exportHtmlPdf } = yield* Effect.tryPromise({
      try: () => import("./unslide/pdf.js"),
      catch: (cause) => commandFailure(cause, { command, path: report.htmlPath, report: report.name }),
    });
    const result = yield* exportHtmlPdf(report.htmlPath, report.pdfPath).pipe(
      Effect.mapError((cause) => commandFailure(cause, {
        command,
        path: report.htmlPath,
        report: report.name,
      })),
    );
    const firstPage = result.pages[0];
    writeOutput({
      report: {
        name: report.name,
        status: "exported",
        pdf: projectPath(config, result.outputPath),
        pageCount: result.pages.length,
        widthPoints: firstPage?.widthPoints ?? 0,
        heightPoints: firstPage?.heightPoints ?? 0,
      },
    });
    return 0;
  }

  if (command === "inspect-pdf") {
    const { inspectPdfPages } = yield* Effect.tryPromise({
      try: () => import("./unslide/pdf-inspection.js"),
      catch: (cause) => commandFailure(cause, { command, path: report.pdfPath, report: report.name }),
    });
    const result = yield* inspectPdfPages(report.pdfPath, report.pdfCaptureDirectory).pipe(
      Effect.mapError((cause) => commandFailure(cause, {
        command,
        path: report.pdfPath,
        report: report.name,
      })),
    );
    writeOutput({
      report: {
        name: report.name,
        status: "pdf-inspected",
        pdf: projectPath(config, result.inputPath),
        output: projectPath(config, result.outputDirectory),
        pageCount: result.pages.length,
      },
      pages: result.pages.map((page) => ({
        index: page.index,
        file: projectPath(config, page.outputPath),
        width: page.width,
        height: page.height,
      })),
    });
    return 0;
  }

  const result = yield* captureHtmlPages(report.htmlPath, report.captureDirectory).pipe(
    Effect.mapError((cause) => commandFailure(cause, {
      command,
      path: report.htmlPath,
      report: report.name,
    })),
  );
  writeOutput({
    report: { name: report.name, status: "captured", pageCount: result.pages.length },
    pages: result.pages.map((page) => ({ id: page.id, file: projectPath(config, page.outputPath), width: page.width, height: page.height })),
  });
  return 0;
});

function invocationCommand(argv: string[]): string {
  if (argv.length === 0) return "home";
  if (argv[0] === "--help") return "help";
  return argv[0] ?? "unknown";
}

function failureLogAnnotations(cause: Cause.Cause<unknown>): Record<string, unknown> {
  const primary = cause.reasons[0];
  let errorTag = "Unknown";
  if (primary?._tag === "Fail") {
    const error = primary.error;
    errorTag = typeof error === "object"
      && error !== null
      && "_tag" in error
      && typeof error._tag === "string"
      ? error._tag
      : "Failure";
  } else if (primary?._tag === "Die") {
    errorTag = "Defect";
  } else if (primary?._tag === "Interrupt") {
    errorTag = "Interrupt";
  }
  const errorMessage = {
    CommandFailure: "Command operation failed.",
    Defect: "Unexpected defect.",
    Failure: "Operation failed.",
    Interrupt: "Operation interrupted.",
    ProjectConfigFailure: "Project configuration failed.",
    ProjectNotFound: "Project discovery failed.",
    ReportNotFound: "Report lookup failed.",
    Unknown: "Operation failed.",
  }[errorTag] ?? "Operation failed.";
  return { errorMessage, errorTag };
}

function instrumentInvocation<E, R>(
  effect: Effect.Effect<number, E, R>,
  command: string,
): Effect.Effect<number, E, R> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("invocation.started");
    return yield* effect.pipe(Effect.onExit((exit) => Effect.gen(function* () {
      if (Exit.isFailure(exit)) {
        yield* Effect.logError("invocation.failed").pipe(
          Effect.annotateLogs(failureLogAnnotations(exit.cause)),
        );
        yield* Effect.logDebug("failure.cause", exit.cause);
      } else if (exit.value === 0) {
        yield* Effect.logInfo("invocation.completed").pipe(Effect.annotateLogs("exitCode", 0));
      } else if (exit.value === 2) {
        yield* Effect.logWarning("invocation.rejected").pipe(Effect.annotateLogs("exitCode", 2));
      } else {
        yield* Effect.logError("invocation.failed").pipe(Effect.annotateLogs("exitCode", exit.value));
      }
    })));
  }).pipe(
    Effect.annotateLogs({ command, invocationId: randomUUID() }),
    Effect.withLogSpan("invocation"),
  );
}

async function main(rawArguments: string[]): Promise<number> {
  const logging = parseLoggingOptions(rawArguments, process.env[LOG_LEVEL_ENV]);
  if (!logging.ok) return usageError(logging.message, topHelp());

  const arguments_ = logging.value.argv;
  const program = provideCliLogging(
    instrumentInvocation(runCommand(arguments_), invocationCommand(arguments_)),
    logging.value.level,
  ).pipe(
    Effect.provide(applicationLayer),
  );
  const exit = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(exit)) return exit.value;

  const failures = exit.cause.reasons.flatMap((reason) =>
    reason._tag === "Fail" && isCliFailure(reason.error) ? [reason.error] : []);
  const primary = failures[0];
  const hasNonOperationalCause = exit.cause.reasons.some((reason) => reason._tag !== "Fail");
  if (primary && !hasNonOperationalCause && exit.cause.reasons.length === 1) {
    return formatCliFailure(primary, rawArguments);
  }
  if (primary && !hasNonOperationalCause) {
    const combinedIssues = failures.flatMap((failure) =>
      failure._tag === "CommandFailure" ? [...(failure.issues ?? [])] : []);
    const combined = primary._tag === "CommandFailure"
      ? new CommandFailure({
        cause: exit.cause,
        code: primary.code,
        command: primary.command,
        issues: combinedIssues.length > 0 ? combinedIssues : primary.issues,
        message: causeMessage(exit.cause),
        path: primary.path,
        report: primary.report,
      })
      : primary;
    return formatCliFailure(combined, rawArguments);
  }
  return defectError();
}

process.exitCode = await main(process.argv.slice(2));
