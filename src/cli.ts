#!/usr/bin/env node
import { access } from "node:fs/promises";
import { relative } from "node:path";
import { encode } from "@toon-format/toon";
import { buildReport } from "./unslide/build.js";
import { captureHtmlPages } from "./unslide/capture.js";
import { getReport, loadProjectConfig, type ProjectConfig } from "./unslide/config.js";
import { inspectHtmlArtifact } from "./unslide/inspect.js";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const CLI_INVOCATION = "pnpm --silent run unslide";

function writeOutput(value: JsonValue): void {
  process.stdout.write(encode(value));
}

function topHelp(): JsonValue {
  return {
    bin: CLI_INVOCATION,
    description: "Build and inspect explicit-page HTML reports in the current project",
    usage: `${CLI_INVOCATION} <command>`,
    commands: [
      { command: "build <name>", description: "Build a named report to standalone HTML" },
      { command: "inspect <name>", description: "Validate a named report's existing HTML artifact" },
      { command: "inspect --artifact <path>", description: "Validate any existing HTML artifact" },
      { command: "capture <name>", description: "Capture a named report's HTML pages" },
    ],
    help: [`Run ${CLI_INVOCATION} <command> --help for command details`],
  };
}

function commandHelp(command: "build" | "inspect" | "capture"): JsonValue {
  if (command === "inspect") {
    return {
      command: "inspect",
      usage: `${CLI_INVOCATION} inspect <name> | ${CLI_INVOCATION} inspect --artifact <path>`,
      flags: [{ flag: "--artifact <path>", description: "Inspect an explicit HTML path instead of a configured report" }],
      examples: [`${CLI_INVOCATION} inspect operating-review`, `${CLI_INVOCATION} inspect --artifact artifacts/report.html`],
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

function runtimeError(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  writeOutput({ error: { code: "operation-failed", message } });
  return 1;
}

function projectPath(config: ProjectConfig, absolutePath: string): string {
  return relative(config.projectRoot, absolutePath) || ".";
}

async function home(): Promise<number> {
  const config = await loadProjectConfig();
  const reports = await Promise.all(Object.values(config.reports).map(async (report) => {
    let status = "built";
    try {
      await access(report.htmlPath);
    } catch {
      status = "not-built";
    }
    return {
      name: report.name,
      source: projectPath(config, report.sourcePath),
      html: projectPath(config, report.htmlPath),
      status,
    };
  }));
  writeOutput({
    bin: CLI_INVOCATION,
    description: "Build and inspect explicit-page HTML reports in the current project",
    project: config.projectRoot,
    reports,
    help: [`Run ${CLI_INVOCATION} build <name>`, `Run ${CLI_INVOCATION} inspect <name>`, `Run ${CLI_INVOCATION} capture <name>`],
  });
  return 0;
}

async function runCommand(argv: string[]): Promise<number> {
  if (argv.length === 0) return home();
  if (argv[0] === "--help") {
    writeOutput(topHelp());
    return 0;
  }

  const command = argv[0];
  if (command !== "build" && command !== "inspect" && command !== "capture") {
    return usageError(`Unknown command "${command}".`, topHelp());
  }
  if (argv.includes("--help")) {
    writeOutput(commandHelp(command));
    return 0;
  }

  const allowedFlags = command === "inspect" ? new Set(["--artifact"]) : new Set<string>();
  const unknownFlag = argv.slice(1).find((argument) => argument.startsWith("-") && !allowedFlags.has(argument));
  if (unknownFlag) {
    return usageError(`Unknown flag "${unknownFlag}" for ${command}.`, commandHelp(command));
  }

  if (command === "inspect" && argv[1] === "--artifact") {
    if (argv.length !== 3 || !argv[2]) {
      return usageError("--artifact requires exactly one HTML path.", commandHelp("inspect"));
    }
    const result = await inspectHtmlArtifact(argv[2]);
    writeOutput({
      artifact: { path: result.inputPath, pageCount: result.pages.length },
      pages: result.pages.map((page) => ({ index: page.index, id: page.id, element: page.tagName })),
    });
    return 0;
  }

  if (argv.length !== 2 || !argv[1]) {
    return usageError(`${command} requires exactly one report name.`, commandHelp(command));
  }

  const config = await loadProjectConfig();
  const report = getReport(config, argv[1]);
  if (command === "build") {
    const result = await buildReport(report);
    writeOutput({ report: { name: result.name, status: "built", html: projectPath(config, result.htmlPath) } });
    return 0;
  }
  if (command === "inspect") {
    const result = await inspectHtmlArtifact(report.htmlPath);
    writeOutput({
      report: { name: report.name, status: "valid", html: projectPath(config, result.inputPath), pageCount: result.pages.length },
      pages: result.pages.map((page) => ({ index: page.index, id: page.id, element: page.tagName })),
    });
    return 0;
  }

  const result = await captureHtmlPages(report.htmlPath, report.captureDirectory);
  writeOutput({
    report: { name: report.name, status: "captured", pageCount: result.pages.length },
    pages: result.pages.map((page) => ({ id: page.id, file: projectPath(config, page.outputPath), width: page.width, height: page.height })),
  });
  return 0;
}

let exitCode: number;
try {
  exitCode = await runCommand(process.argv.slice(2));
} catch (error) {
  exitCode = runtimeError(error);
}
process.exitCode = exitCode;
