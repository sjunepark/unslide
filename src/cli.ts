#!/usr/bin/env node
import { homedir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { encode } from "@toon-format/toon";
import { Cause, Effect, Exit, FileSystem } from "effect";
import { buildReport } from "./unslide/build.js";
import { captureHtmlPages } from "./unslide/capture.js";
import { getReport, loadProjectConfig, type ProjectConfig } from "./unslide/config.js";
import { commandFailure, CommandFailure, type CliFailure } from "./unslide/failures.js";
import { initializeProject } from "./unslide/init.js";
import { inspectHtmlArtifact } from "./unslide/inspect.js";
import { causeMessage } from "./unslide/lifecycle.js";
import { applicationLayer } from "./unslide/runtime.js";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const CLI_INVOCATION = process.env.UNSLIDE_INVOCATION ?? "pnpm --silent run unslide";

function writeOutput(value: JsonValue): void {
  process.stdout.write(encode(value));
}

function displayExecutable(): string {
  const executable = resolve(process.env.UNSLIDE_BIN ?? process.argv[1] ?? "unslide");
  const home = homedir();
  return executable.startsWith(`${home}${sep}`) ? `~${executable.slice(home.length)}` : executable;
}

function topHelp(): JsonValue {
  return {
    bin: displayExecutable(),
    description: "Build and inspect explicit-page HTML and PDF reports",
    usage: `${CLI_INVOCATION} <command>`,
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
      ],
      examples: [`${CLI_INVOCATION} init`, `${CLI_INVOCATION} init --yes`, `${CLI_INVOCATION} init --name quarterly-review --yes`],
    };
  }
  if (command === "inspect") {
    return {
      command: "inspect",
      usage: `${CLI_INVOCATION} inspect <name> | ${CLI_INVOCATION} inspect --artifact <path>`,
      flags: [{ flag: "--artifact <path>", description: "Inspect an explicit HTML path instead of a configured report" }],
      examples: [`${CLI_INVOCATION} inspect operating-review`, `${CLI_INVOCATION} inspect --artifact artifacts/report.html`],
    };
  }
  if (command === "inspect-pdf") {
    return {
      command: "inspect-pdf",
      usage: `${CLI_INVOCATION} inspect-pdf <name> | ${CLI_INVOCATION} inspect-pdf --artifact <path> --output <directory>`,
      flags: [
        { flag: "--artifact <path>", description: "Inspect an explicit PDF path instead of a configured report" },
        { flag: "--output <directory>", description: "Write explicit-artifact page images to this directory" },
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
    flags: [],
    examples: [`${CLI_INVOCATION} ${command} spike`, `${CLI_INVOCATION} ${command} operating-review`],
  };
}

function usageError(message: string, help: JsonValue): number {
  writeOutput({ error: { code: "usage", message }, help });
  return 2;
}

function defectError(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  writeOutput({ error: { code: "operation-failed", message } });
  return 1;
}

function formatCliFailure(error: CliFailure, invocation: "home" | "command"): number {
  switch (error._tag) {
    case "ProjectNotFound":
      if (invocation === "home") {
        writeOutput({
          error: { code: "project-not-found", message: error.message },
          help: [`Run ${CLI_INVOCATION} init to plan a new project`],
        });
      } else {
        writeOutput({ error: { code: "operation-failed", message: error.message } });
      }
      return 1;
    case "ProjectConfigFailure":
    case "ReportNotFound":
    case "CommandFailure":
      writeOutput({ error: { code: "operation-failed", message: error.message } });
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

const home = Effect.fn("cli.home")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const config = yield* loadProjectConfig();
  const reports = yield* Effect.all(Object.values(config.reports).map((report) => fs.exists(report.htmlPath).pipe(
    Effect.map((exists) => ({
      name: report.name,
      source: projectPath(config, report.sourcePath),
      html: projectPath(config, report.htmlPath),
      status: exists ? "built" : "not-built",
    })),
    Effect.mapError((cause) => commandFailure(cause, { command: "home", path: report.htmlPath, report: report.name })),
  )));
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
    writeOutput(topHelp());
    return 0;
  }

  const command = argv[0];
  if (command !== "build" && command !== "inspect" && command !== "capture" && command !== "export" && command !== "inspect-pdf" && command !== "init") {
    return usageError(`Unknown command "${command}".`, topHelp());
  }
  if (argv.includes("--help")) {
    writeOutput(commandHelp(command));
    return 0;
  }

  const allowedFlags = command === "inspect"
    ? new Set(["--artifact"])
    : command === "inspect-pdf"
      ? new Set(["--artifact", "--output"])
    : command === "init"
      ? new Set(["--name", "--yes"])
      : new Set<string>();
  const unknownFlag = argv.slice(1).find((argument) => argument.startsWith("-") && !allowedFlags.has(argument));
  if (unknownFlag) {
    return usageError(`Unknown flag "${unknownFlag}" for ${command}.`, commandHelp(command));
  }

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

    const result = yield* initializeProject(process.cwd(), reportName, write);
    const init = {
      root: result.projectRoot,
      report: result.reportName,
      status: result.status,
      files: result.files.map((file) => ({ path: file.relativePath, status: file.state })),
    };
    if (result.status === "conflict") {
      writeOutput({
        error: { code: "file-conflict", message: "Initialization would overwrite files with different contents." },
        init,
        help: ["Move or reconcile the conflicting files, then run init again"],
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

  const config = yield* loadProjectConfig();
  const report = yield* getReport(config, argv[1]);
  if (command === "build") {
    const result = yield* buildReport(report);
    writeOutput({ report: { name: result.name, status: "built", html: projectPath(config, result.htmlPath) } });
    return 0;
  }
  if (command === "inspect") {
    const result = yield* inspectHtmlArtifact(report.htmlPath);
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
    const result = yield* exportHtmlPdf(report.htmlPath, report.pdfPath);
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
    const result = yield* inspectPdfPages(report.pdfPath, report.pdfCaptureDirectory);
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

  const result = yield* captureHtmlPages(report.htmlPath, report.captureDirectory);
  writeOutput({
    report: { name: report.name, status: "captured", pageCount: result.pages.length },
    pages: result.pages.map((page) => ({ id: page.id, file: projectPath(config, page.outputPath), width: page.width, height: page.height })),
  });
  return 0;
});

const arguments_ = process.argv.slice(2);
const exit = await Effect.runPromiseExit(
  runCommand(arguments_).pipe(Effect.provide(applicationLayer)),
);
let exitCode: number;
if (Exit.isSuccess(exit)) {
  exitCode = exit.value;
} else {
  const failures = exit.cause.reasons.flatMap((reason) =>
    reason._tag === "Fail" && isCliFailure(reason.error) ? [reason.error] : []);
  const primary = failures[0];
  const hasNonOperationalCause = exit.cause.reasons.some((reason) => reason._tag !== "Fail");
  if (primary && !hasNonOperationalCause && exit.cause.reasons.length === 1) {
    exitCode = formatCliFailure(primary, arguments_.length === 0 ? "home" : "command");
  } else if (primary && !hasNonOperationalCause) {
    const combined = primary._tag === "CommandFailure"
      ? new CommandFailure({
        cause: exit.cause,
        command: primary.command,
        message: causeMessage(exit.cause),
        path: primary.path,
        report: primary.report,
      })
      : primary;
    exitCode = formatCliFailure(combined, arguments_.length === 0 ? "home" : "command");
  } else {
    exitCode = defectError(new Error(causeMessage(exit.cause), { cause: Cause.squash(exit.cause) }));
  }
}
process.exitCode = exitCode;
