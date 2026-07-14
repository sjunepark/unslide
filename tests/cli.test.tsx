import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { decode, encode } from "@toon-format/toon";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(".");
const cliPath = resolve("src/cli.ts");
const tsxImport = import.meta.resolve("tsx");

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
  value: Record<string, unknown>;
}

async function runCli(arguments_: string[], cwd = repositoryRoot, environment: NodeJS.ProcessEnv = {}): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", tsxImport, cliPath, ...arguments_],
      { cwd, env: { ...process.env, UNSLIDE_LOG_LEVEL: "off", ...environment } },
    );
    return { exitCode: 0, stderr, stdout, value: decode(stdout) as Record<string, unknown> };
  } catch (error) {
    const failure = error as Error & { code: number; stderr: string; stdout: string };
    return {
      exitCode: failure.code,
      stderr: failure.stderr,
      stdout: failure.stdout,
      value: decode(failure.stdout) as Record<string, unknown>,
    };
  }
}

const stableCliEnvironment = {
  UNSLIDE_BIN: "/opt/unslide/bin/unslide",
  UNSLIDE_INVOCATION: "unslide",
};

const stableLogLevelFlag = {
  flag: "--log-level <off|info|debug>",
  description: "Emit Effect JSON Lines on stderr (default: UNSLIDE_LOG_LEVEL or off)",
};

const stableHelpFlag = {
  flag: "--help",
  description: "Show concise command help without requiring command values",
};

interface EffectLogEntry {
  annotations: Record<string, unknown>;
  cause?: string;
  level: string;
  message: string;
  spans: Record<string, number>;
  timestamp: string;
}

function parseLogs(stderr: string): EffectLogEntry[] {
  return stderr.trim() === ""
    ? []
    : stderr.trim().split("\n").map((line) => JSON.parse(line) as EffectLogEntry);
}

function stableTopHelp() {
  return {
    bin: "/opt/unslide/bin/unslide",
    description: "Build and inspect explicit-page HTML and PDF reports",
    usage: "unslide <command>",
    flags: [stableHelpFlag, stableLogLevelFlag],
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
    help: ["Run unslide <command> --help for command details"],
  };
}

async function runPackageCli(arguments_: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "pnpm",
      ["--silent", "run", "unslide", ...arguments_],
      { cwd: repositoryRoot, env: { ...process.env, UNSLIDE_LOG_LEVEL: "off" } },
    );
    return { exitCode: 0, stderr, stdout, value: decode(stdout) as Record<string, unknown> };
  } catch (error) {
    const failure = error as Error & { code: number; stderr: string; stdout: string };
    return {
      exitCode: failure.code,
      stderr: failure.stderr,
      stdout: failure.stdout,
      value: decode(failure.stdout) as Record<string, unknown>,
    };
  }
}

async function createProject(prefix = "unslide cli project "): Promise<string> {
  await mkdir(resolve(repositoryRoot, ".tmp"), { recursive: true });
  const projectRoot = await mkdtemp(resolve(repositoryRoot, ".tmp", prefix));
  await mkdir(resolve(projectRoot, "source files"), { recursive: true });
  await writeFile(resolve(projectRoot, "source files", "report.tsx"), `
    import React from "react";

    export default (
      <html lang="en">
        <head><meta name="unslide-protocol" content="1" /><title>CLI fixture</title><style>{
          "@page{size:320px 180px;margin:0}body{margin:0}[data-unslide-page]{width:320px;height:180px;background:white}"
        }</style></head>
        <body><main data-unslide-page="fixture">CLI fixture</main></body>
      </html>
    );
  `);
  await writeFile(resolve(projectRoot, "unslide.json"), JSON.stringify({
    version: 1,
    reports: {
      fixture: {
        source: "source files/report.tsx",
        html: "generated output/report file.html",
        captures: "captured pages",
      },
    },
  }, null, 2));
  return projectRoot;
}

test("CLI help and usage errors are structured, noninteractive, and stable", async () => {
  const help = await runCli(["--help"]);
  assert.equal(help.exitCode, 0);
  assert.equal(help.stderr, "");
  assert.match(String(help.value.bin), /src\/cli\.ts$/);
  assert.equal(help.value.usage, `${shellQuote(cliPath)} <command>`);

  const commandHelp = await runCli(["capture", "--help"]);
  assert.equal(commandHelp.exitCode, 0);
  assert.equal(commandHelp.stderr, "");
  assert.equal(commandHelp.value.command, "capture");

  const exportHelp = await runCli(["export", "--help"]);
  assert.equal(exportHelp.exitCode, 0);
  assert.equal(exportHelp.value.command, "export");

  const pdfInspectionHelp = await runCli(["inspect-pdf", "--help"]);
  assert.equal(pdfInspectionHelp.exitCode, 0);
  assert.equal(pdfInspectionHelp.value.command, "inspect-pdf");

  for (const command of ["build", "inspect", "capture", "export", "inspect-pdf", "init"]) {
    const result = await runCli([command, "--help"], repositoryRoot, stableCliEnvironment);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual((result.value.flags as unknown[]).slice(-2), [stableHelpFlag, stableLogLevelFlag]);
  }

  for (const result of [
    await runCli(["unknown"]),
    await runCli(["build"]),
    await runCli(["capture", "fixture", "extra"]),
    await runCli(["build", "fixture", "--wat"]),
    await runCli(["build", "--artifact"]),
    await runCli(["capture", "--artifact", "report.html"]),
    await runCli(["inspect-pdf", "--artifact", "report.pdf"]),
    await runCli(["inspect-pdf", "--output", "pages"]),
    await runCli(["build", "--wat", "--help"]),
    await runCli(["build", "report", "extra", "--help"]),
  ]) {
    assert.equal(result.exitCode, 2);
    assert.equal(result.stderr, "");
    assert.ok(result.value.error);
    assert.ok(result.value.help);
  }
});

test("silent package-script invocation preserves structured stdout on failure", async () => {
  const result = await runPackageCli(["build", "--artifact"]);
  assert.equal(result.exitCode, 2);
  assert.equal(result.stderr, "");
  assert.equal((result.value.error as Record<string, unknown>).code, "usage");
});

test("help commands preserve repository, PATH, and safely quoted direct invocation", async () => {
  const directory = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide invocation "));
  const pathDirectory = resolve(directory, "path-bin");
  const spacedDirectory = resolve(directory, "installed copy");
  const pathExecutable = resolve(pathDirectory, "unslide");
  const spacedExecutable = resolve(spacedDirectory, "unslide tool");
  await mkdir(pathDirectory, { recursive: true });
  await mkdir(spacedDirectory, { recursive: true });
  await symlink(resolve(repositoryRoot, "bin/unslide.mjs"), pathExecutable);
  await symlink(resolve(repositoryRoot, "bin/unslide.mjs"), spacedExecutable);

  try {
    const pathInvocation = await runCli(["build", "--help"], repositoryRoot, {
      PATH: `${pathDirectory}${delimiter}${process.env.PATH ?? ""}`,
      UNSLIDE_BIN: resolve(repositoryRoot, "bin/unslide.mjs"),
      UNSLIDE_INVOCATION: undefined,
      npm_lifecycle_event: undefined,
    });
    assert.equal((pathInvocation.value as { usage: string }).usage, "unslide build <name>");

    const directInvocation = await runCli(["build", "--help"], repositoryRoot, {
      PATH: process.env.PATH,
      UNSLIDE_BIN: spacedExecutable,
      UNSLIDE_INVOCATION: undefined,
      npm_lifecycle_event: undefined,
    });
    assert.equal(
      (directInvocation.value as { usage: string }).usage,
      `${shellQuote(spacedExecutable)} build <name>`,
    );

    const repositoryInvocation = await runCli(["build", "--help"], repositoryRoot, {
      UNSLIDE_BIN: spacedExecutable,
      UNSLIDE_INVOCATION: undefined,
      npm_lifecycle_event: "unslide",
    });
    assert.equal(
      (repositoryInvocation.value as { usage: string }).usage,
      "pnpm --silent run unslide build <name>",
    );

    assert.equal(await realpath(pathExecutable), await realpath(resolve(repositoryRoot, "bin/unslide.mjs")));
    assert.equal(await realpath(spacedExecutable), await realpath(resolve(repositoryRoot, "bin/unslide.mjs")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("global Effect logging is opt-in, structured, and configurable by flag or environment", async () => {
  const info = await runCli(["--log-level", "info", "--help"], repositoryRoot, stableCliEnvironment);
  assert.equal(info.exitCode, 0);
  assert.equal(info.stdout, encode(stableTopHelp()));
  assert.equal(info.value.usage, "unslide <command>");
  const infoLogs = parseLogs(info.stderr);
  assert.deepEqual(infoLogs.map((entry) => entry.message), ["invocation.started", "invocation.completed"]);
  assert.ok(infoLogs.every((entry) => entry.level === "INFO"));
  assert.ok(infoLogs.every((entry) => entry.annotations.command === "help"));
  assert.equal(new Set(infoLogs.map((entry) => entry.annotations.invocationId)).size, 1);
  assert.ok(infoLogs.every((entry) => Number.isFinite(Date.parse(entry.timestamp))));

  const environment = await runCli(["--help"], repositoryRoot, {
    ...stableCliEnvironment,
    UNSLIDE_LOG_LEVEL: "info",
  });
  assert.equal(parseLogs(environment.stderr).length, 2);

  const rejected = await runCli(["build", "--log-level", "info"], repositoryRoot, stableCliEnvironment);
  assert.equal(rejected.exitCode, 2);
  assert.ok(parseLogs(rejected.stderr).some((entry) =>
    entry.message === "invocation.rejected" && entry.annotations.exitCode === 2));

  const disabled = await runCli(["--help", "--log-level", "off"], repositoryRoot, {
    ...stableCliEnvironment,
    UNSLIDE_LOG_LEVEL: "debug",
  });
  assert.equal(disabled.exitCode, 0);
  assert.equal(disabled.stderr, "");

  const interruptionScript = `
    import { Effect } from "effect";
    import { provideCliLogging, withLogPhase } from ${JSON.stringify(pathToFileURL(resolve("src/unslide/logging.ts")).href)};
    const controller = new AbortController();
    const pending = Effect.runPromiseExit(
      provideCliLogging(withLogPhase(Effect.never, "interruption.fixture"), "info"),
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 20);
    await pending;
  `;
  const interrupted = await execFileAsync(
    process.execPath,
    ["--import", tsxImport, "--input-type=module", "--eval", interruptionScript],
    { cwd: repositoryRoot },
  );
  assert.equal(interrupted.stdout, "");
  assert.deepEqual(
    parseLogs(interrupted.stderr).map((entry) => entry.message),
    ["phase.started", "phase.failed"],
  );

  for (const result of [
    await runCli(["--log-level", "trace", "--help"], repositoryRoot, stableCliEnvironment),
    await runCli(["--log-level=debug", "--help"], repositoryRoot, stableCliEnvironment),
    await runCli(["--log-level", "info", "--help", "--log-level", "debug"], repositoryRoot, stableCliEnvironment),
    await runCli(["--help"], repositoryRoot, { ...stableCliEnvironment, UNSLIDE_LOG_LEVEL: "TRACE" }),
  ]) {
    assert.equal(result.exitCode, 2);
    assert.equal(result.stderr, "");
    assert.equal((result.value.error as Record<string, unknown>).code, "usage");
  }
});

test("logging keeps stable failures on info and adds full Effect causes on debug", async () => {
  const projectRoot = await createProject("unslide logging failures ");
  try {
    const info = await runCli(["build", "missing", "--log-level", "info"], projectRoot, stableCliEnvironment);
    assert.equal(info.exitCode, 1);
    assert.equal((info.value.error as Record<string, unknown>).code, "report-not-found");
    const infoLogs = parseLogs(info.stderr);
    const infoFailure = infoLogs.find((entry) => entry.message === "invocation.failed");
    assert.equal(infoFailure?.level, "ERROR");
    assert.equal(infoFailure?.annotations.errorTag, "ReportNotFound");
    assert.equal(infoFailure?.annotations.errorMessage, "Report lookup failed.");
    assert.equal(infoLogs.some((entry) => entry.message === "failure.cause"), false);

    const debug = await runCli(["--log-level", "debug", "build", "missing"], projectRoot, stableCliEnvironment);
    assert.equal(debug.exitCode, 1);
    assert.equal(debug.stdout, info.stdout);
    const debugLogs = parseLogs(debug.stderr);
    const cause = debugLogs.find((entry) => entry.message === "failure.cause");
    assert.equal(cause?.level, "DEBUG");
    assert.match(cause?.cause ?? "", /Unknown report "missing"/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("CLI root preserves exact TOON bytes and maps every tagged failure", async () => {
  const externalRoot = await mkdtemp(resolve(tmpdir(), "unslide-cli-boundary-"));
  const canonicalExternalRoot = await realpath(externalRoot);
  const projectRoot = await createProject("unslide failure mapping ");
  try {
    const help = await runCli(["--help"], repositoryRoot, stableCliEnvironment);
    assert.deepEqual(
      { exitCode: help.exitCode, stderr: help.stderr, stdout: help.stdout },
      { exitCode: 0, stderr: "", stdout: encode(stableTopHelp()) },
    );

    const usage = await runCli(["build"], repositoryRoot, stableCliEnvironment);
    assert.deepEqual(
      { exitCode: usage.exitCode, stderr: usage.stderr, stdout: usage.stdout },
      {
        exitCode: 2,
        stderr: "",
        stdout: encode({
          error: { code: "usage", message: "build requires exactly one report name." },
          help: {
            command: "build",
            usage: "unslide build <name>",
            flags: [stableHelpFlag, stableLogLevelFlag],
            examples: ["unslide build spike", "unslide build operating-review"],
          },
        }),
      },
    );

    const missingProject = await runCli([], externalRoot, stableCliEnvironment);
    const missingMessage = `No unslide.json project configuration was found from ${canonicalExternalRoot}.`;
    assert.deepEqual(
      { exitCode: missingProject.exitCode, stderr: missingProject.stderr, stdout: missingProject.stdout },
      {
        exitCode: 1,
        stderr: "",
        stdout: encode({
          error: { code: "project-not-found", message: missingMessage },
          help: ["Run unslide init to plan a new project"],
        }),
      },
    );

    const namedMissingProject = await runCli(["build", "fixture"], externalRoot, stableCliEnvironment);
    assert.deepEqual(
      { exitCode: namedMissingProject.exitCode, stderr: namedMissingProject.stderr, stdout: namedMissingProject.stdout },
      {
        exitCode: 1,
        stderr: "",
        stdout: encode({
          error: { code: "project-not-found", message: missingMessage },
          help: ["Run unslide init to plan a new project"],
        }),
      },
    );

    const externalConfigPath = resolve(externalRoot, "unslide.json");
    const canonicalExternalConfigPath = resolve(canonicalExternalRoot, "unslide.json");
    await mkdir(externalConfigPath);
    const unreadableConfig = await runCli([], externalRoot, stableCliEnvironment);
    assert.equal(unreadableConfig.exitCode, 1);
    assert.equal(unreadableConfig.stderr, "");
    assert.deepEqual(unreadableConfig.value.error, {
      code: "project-config-unreadable",
      message: "Project configuration cannot be read.",
      path: canonicalExternalConfigPath,
    });

    await rm(externalConfigPath, { recursive: true });
    await writeFile(externalConfigPath, JSON.stringify({ version: 2, reports: {} }));
    const invalidConfig = await runCli([], externalRoot, stableCliEnvironment);
    assert.deepEqual(
      { exitCode: invalidConfig.exitCode, stderr: invalidConfig.stderr, stdout: invalidConfig.stdout },
      {
        exitCode: 1,
        stderr: "",
        stdout: encode({
          error: {
            code: "project-config-invalid",
            message: "Project configuration is invalid.",
            path: canonicalExternalConfigPath,
            detail: "Unsupported unslide.json version 2. This release supports version 1; update the configuration manually because automatic migration is not available.",
          },
        }),
      },
    );

    const missingReport = await runCli(["build", "missing"], projectRoot, stableCliEnvironment);
    assert.deepEqual(
      { exitCode: missingReport.exitCode, stderr: missingReport.stderr, stdout: missingReport.stdout },
      {
        exitCode: 1,
        stderr: "",
        stdout: encode({
          error: {
            code: "report-not-found",
            message: 'Report "missing" is not configured.',
            availableReports: ["fixture"],
          },
          help: ["Run unslide build <name>"],
        }),
      },
    );

    const invalidArtifact = await runCli(
      ["inspect", "--artifact", resolve(repositoryRoot, "tests/fixtures/protocol-no-pages.html")],
      repositoryRoot,
      stableCliEnvironment,
    );
    assert.deepEqual(
      { exitCode: invalidArtifact.exitCode, stderr: invalidArtifact.stderr, stdout: invalidArtifact.stdout },
      {
        exitCode: 1,
        stderr: "",
        stdout: encode({
          error: {
            code: "artifact-invalid",
            message: "HTML artifact is invalid.",
            path: resolve(repositoryRoot, "tests/fixtures/protocol-no-pages.html"),
          },
        }),
      },
    );
  } finally {
    await rm(externalRoot, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("operational failures use stable codes, corrective commands, and diagnostic-only raw causes", async () => {
  const projectRoot = await createProject("unslide operational failures ");
  const htmlPath = resolve(projectRoot, "generated output", "report file.html");
  const pdfPath = resolve(projectRoot, "generated output", "report file.pdf");
  const missingBrowsers = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide missing browsers "));
  const brokenBrowsers = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide broken browsers "));

  try {
    for (const command of ["inspect", "capture", "export"]) {
      const result = await runCli([command, "fixture"], projectRoot, stableCliEnvironment);
      assert.equal(result.exitCode, 1);
      assert.equal(result.stderr, "");
      assert.deepEqual(result.value, {
        error: {
          code: "artifact-not-found",
          message: "HTML artifact was not found.",
          report: "fixture",
          path: htmlPath,
        },
        help: ["Run unslide build fixture"],
      });
    }

    const missingPdf = await runCli(["inspect-pdf", "fixture"], projectRoot, stableCliEnvironment);
    assert.equal(missingPdf.exitCode, 1);
    assert.equal(missingPdf.stderr, "");
    assert.deepEqual(missingPdf.value, {
      error: {
        code: "artifact-not-found",
        message: "PDF artifact was not found.",
        report: "fixture",
        path: pdfPath,
      },
      help: ["Run unslide export fixture"],
    });

    await mkdir(dirname(htmlPath), { recursive: true });
    await writeFile(htmlPath, await readFile(resolve(repositoryRoot, "tests/fixtures/protocol-no-pages.html")));
    const invalidHtml = await runCli(["inspect", "fixture"], projectRoot, stableCliEnvironment);
    assert.equal(invalidHtml.exitCode, 1);
    assert.equal(invalidHtml.stderr, "");
    assert.deepEqual(invalidHtml.value, {
      error: {
        code: "artifact-invalid",
        message: "HTML artifact is invalid.",
        report: "fixture",
        path: htmlPath,
      },
      help: ["Run unslide build fixture"],
    });

    await writeFile(htmlPath, '<!doctype html><html><body><main data-unslide-page="hidden" style="display:none">Hidden</main></body></html>');
    const invalidCaptureGeometry = await runCli(["capture", "fixture"], projectRoot, stableCliEnvironment);
    assert.equal(invalidCaptureGeometry.exitCode, 1);
    assert.equal(invalidCaptureGeometry.stderr, "");
    assert.equal((invalidCaptureGeometry.value.error as Record<string, unknown>).code, "artifact-invalid");
    assert.deepEqual(invalidCaptureGeometry.value.help, ["Run unslide build fixture"]);

    await writeFile(htmlPath, '<!doctype html><html><body><main data-unslide-page="page">No print geometry</main></body></html>');
    const invalidPrintCss = await runCli(["export", "fixture"], projectRoot, stableCliEnvironment);
    assert.equal(invalidPrintCss.exitCode, 1);
    assert.equal(invalidPrintCss.stderr, "");
    assert.equal((invalidPrintCss.value.error as Record<string, unknown>).code, "artifact-invalid");
    assert.deepEqual(invalidPrintCss.value.help, ["Run unslide build fixture"]);

    await writeFile(pdfPath, "not a PDF");
    const invalidPdf = await runCli(["inspect-pdf", "fixture"], projectRoot, stableCliEnvironment);
    assert.equal(invalidPdf.exitCode, 1);
    assert.equal(invalidPdf.stderr, "");
    assert.deepEqual(invalidPdf.value, {
      error: {
        code: "artifact-invalid",
        message: "PDF artifact is invalid.",
        report: "fixture",
        path: pdfPath,
      },
      help: ["Run unslide export fixture"],
    });

    await writeFile(htmlPath, await readFile(resolve(repositoryRoot, "tests/fixtures/protocol-valid.html")));
    const browserMissing = await runCli(["capture", "fixture"], projectRoot, {
      ...stableCliEnvironment,
      PLAYWRIGHT_BROWSERS_PATH: missingBrowsers,
    });
    assert.equal(browserMissing.exitCode, 1);
    assert.equal(browserMissing.stderr, "");
    assert.deepEqual(browserMissing.value, {
      error: { code: "browser-not-installed", message: "The canonical Chromium browser is not installed." },
      help: ["Run pnpm dlx playwright@1.61.1 install chromium"],
    });

    const executableProbe = await execFileAsync(
      process.execPath,
      ["--input-type=module", "--eval", 'import { chromium } from "playwright"; process.stdout.write(chromium.executablePath())'],
      {
        cwd: repositoryRoot,
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: brokenBrowsers },
      },
    );
    const brokenExecutable = executableProbe.stdout;
    await mkdir(dirname(brokenExecutable), { recursive: true });
    await writeFile(brokenExecutable, "#!/bin/sh\nexit 73\n");
    await chmod(brokenExecutable, 0o755);

    const launchFailure = await runCli(["capture", "fixture"], projectRoot, {
      ...stableCliEnvironment,
      PLAYWRIGHT_BROWSERS_PATH: brokenBrowsers,
    });
    assert.equal(launchFailure.exitCode, 1);
    assert.equal(launchFailure.stderr, "");
    assert.deepEqual(launchFailure.value, {
      error: {
        code: "command-failed",
        message: "capture failed.",
        report: "fixture",
        path: htmlPath,
      },
    });

    const debugLaunchFailure = await runCli(["capture", "fixture", "--log-level", "debug"], projectRoot, {
      ...stableCliEnvironment,
      PLAYWRIGHT_BROWSERS_PATH: brokenBrowsers,
    });
    assert.equal(debugLaunchFailure.stdout, launchFailure.stdout);
    assert.match(debugLaunchFailure.stderr, /Cannot launch the canonical Chromium browser|BrowserFailure/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(missingBrowsers, { recursive: true, force: true });
    await rm(brokenBrowsers, { recursive: true, force: true });
  }
});

test("CLI init plans writes, applies explicit confirmation, and refuses conflicts", async () => {
  await mkdir(resolve(repositoryRoot, ".tmp"), { recursive: true });
  const projectRoot = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide init project "));
  try {
    const plan = await runCli(["init", "--name", "quarterly-review"], projectRoot);
    assert.equal(plan.exitCode, 0);
    assert.equal(plan.stderr, "");
    assert.equal((plan.value.init as Record<string, unknown>).status, "planned");
    await assert.rejects(readFile(resolve(projectRoot, "unslide.json"), "utf8"), /ENOENT/);

    const creation = await runCli(["init", "--name", "quarterly-review", "--yes"], projectRoot);
    assert.equal(creation.exitCode, 0);
    assert.equal(creation.stderr, "");
    assert.equal((creation.value.init as Record<string, unknown>).status, "created");
    assert.match(await readFile(resolve(projectRoot, "quarterly-review.tsx"), "utf8"), /data-unslide-page="welcome"/);
    assert.match(await readFile(resolve(projectRoot, "quarterly-review.css"), "utf8"), /Optional starter styling/);

    const repeat = await runCli(["init", "--name", "quarterly-review", "--yes"], projectRoot);
    assert.equal(repeat.exitCode, 0);
    assert.equal((repeat.value.init as Record<string, unknown>).status, "unchanged");

    await writeFile(resolve(projectRoot, "quarterly-review.css"), "user-owned change\n");
    const conflict = await runCli(["init", "--name", "quarterly-review", "--yes"], projectRoot);
    assert.equal(conflict.exitCode, 1);
    assert.equal(conflict.stderr, "");
    assert.equal((conflict.value.error as Record<string, unknown>).code, "command-failed");
    assert.deepEqual(conflict.value.help, [
      `Run ${shellQuote(cliPath)} init --name quarterly-review --yes after reconciling the conflicting files`,
    ]);
    assert.equal(await readFile(resolve(projectRoot, "quarterly-review.css"), "utf8"), "user-owned change\n");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("CLI init rejects unsupported arguments and invalid report names", async () => {
  for (const result of [
    await runCli(["init", "--name"]),
    await runCli(["init", "--name", "Quarterly Review"]),
    await runCli(["init", "--yes", "--yes"]),
    await runCli(["init", "--unknown"]),
  ]) {
    assert.equal(result.exitCode, 2);
    assert.equal(result.stderr, "");
    assert.ok(result.value.help);
  }
});

test("CLI discovers a project from nested paths and handles spaces end to end", async () => {
  const projectRoot = await createProject();
  const nestedDirectory = resolve(projectRoot, "nested directory", "deeper");
  await mkdir(nestedDirectory, { recursive: true });

  try {
    const home = await runCli([], nestedDirectory);
    assert.equal(home.exitCode, 0);
    assert.equal(home.stderr, "");
    assert.equal(home.value.project, projectRoot);

    const build = await runCli(["build", "fixture"], nestedDirectory);
    assert.equal(build.exitCode, 0, build.stdout);
    assert.equal(build.stderr, "");
    assert.match(await readFile(resolve(projectRoot, "generated output", "report file.html"), "utf8"), /data-unslide-page="fixture"/);

    const inspection = await runCli(["inspect", "fixture"], projectRoot);
    assert.equal(inspection.exitCode, 0);
    assert.equal(inspection.stderr, "");
    assert.equal((inspection.value.report as Record<string, unknown>).pageCount, 1);

    const capture = await runCli(["capture", "fixture", "--log-level", "debug"], projectRoot);
    assert.equal(capture.exitCode, 0);
    const captureLogs = parseLogs(capture.stderr);
    assert.ok(captureLogs.some((entry) => entry.annotations.phase === "browser.readiness"));
    assert.ok(captureLogs.some((entry) => entry.message === "page.captured"));
    assert.equal(new Set(captureLogs.map((entry) => entry.annotations.invocationId)).size, 1);
    const png = await readFile(resolve(projectRoot, "captured pages", "page-01.png"));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [320, 180]);

    const exported = await runCli(["export", "fixture"], projectRoot);
    assert.equal(exported.exitCode, 0, exported.stdout);
    assert.equal((exported.value.report as Record<string, unknown>).pageCount, 1);
    assert.equal((exported.value.report as Record<string, unknown>).widthPoints, 240);
    assert.equal((await readFile(resolve(projectRoot, "generated output", "report file.pdf"))).subarray(0, 5).toString(), "%PDF-");

    const pdfInspection = await runCli(["inspect-pdf", "fixture"], projectRoot);
    assert.equal(pdfInspection.exitCode, 0, pdfInspection.stdout);
    assert.equal((pdfInspection.value.report as Record<string, unknown>).pageCount, 1);
    assert.equal((pdfInspection.value.report as Record<string, unknown>).status, "pdf-inspected");
    const pdfPng = await readFile(resolve(projectRoot, "captured pages-pdf", "page-01.png"));
    assert.deepEqual([pdfPng.readUInt32BE(16), pdfPng.readUInt32BE(20)], [320, 181]);

    const explicitOutput = resolve(projectRoot, "standalone pdf pages");
    const explicitInspection = await runCli([
      "inspect-pdf",
      "--artifact",
      resolve(projectRoot, "generated output", "report file.pdf"),
      "--output",
      explicitOutput,
    ], nestedDirectory);
    assert.equal(explicitInspection.exitCode, 0, explicitInspection.stdout);
    assert.equal((explicitInspection.value.pdf as Record<string, unknown>).pageCount, 1);
    assert.equal((await readFile(resolve(explicitOutput, "page-01.png"))).subarray(1, 4).toString(), "PNG");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("CLI inspection accepts a standalone artifact without project configuration", async () => {
  const directory = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide artifact "));
  const artifactPath = resolve(directory, "existing report.html");
  await writeFile(artifactPath, '<!doctype html><html><body><article data-unslide-page="only">Only</article></body></html>');

  try {
    const result = await runCli(["inspect", "--artifact", artifactPath], directory);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal((result.value.artifact as Record<string, unknown>).pageCount, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI rejects missing reports, visual fields, and unsafe output paths", async () => {
  const projectRoot = await createProject("unslide invalid project ");
  const configPath = resolve(projectRoot, "unslide.json");
  const outsideDirectory = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide outside "));

  try {
    const missing = await runCli(["build", "missing"], projectRoot);
    assert.equal(missing.exitCode, 1);
    assert.equal(missing.stderr, "");
    assert.deepEqual(missing.value.error, {
      code: "report-not-found",
      message: 'Report "missing" is not configured.',
      availableReports: ["fixture"],
    });

    const inheritedName = await runCli(["build", "constructor"], projectRoot);
    assert.equal(inheritedName.exitCode, 1);
    assert.equal((inheritedName.value.error as Record<string, unknown>).code, "report-not-found");

    await writeFile(configPath, JSON.stringify({ version: 2, reports: {} }));
    const unsupportedVersion = await runCli([], projectRoot);
    assert.equal(unsupportedVersion.exitCode, 1);
    assert.match(JSON.stringify(unsupportedVersion.value), /project-config-invalid.*Unsupported unslide\.json version 2.*automatic migration is not available/);

    await writeFile(configPath, JSON.stringify({
      version: 1,
      reports: {
        fixture: {
          source: "source files/report.tsx",
          html: "generated/report.html",
          captures: "captures",
          pageSize: "A4",
        },
      },
    }));
    const visualField = await runCli([], projectRoot);
    assert.equal(visualField.exitCode, 1);
    assert.match(JSON.stringify(visualField.value), /unknown field.*pageSize/);

    await writeFile(configPath, JSON.stringify({
      version: 1,
      reports: {
        fixture: {
          source: "source files/report.tsx",
          html: "../outside/report.html",
          captures: "captures",
        },
      },
    }));
    const escapedOutput = await runCli([], projectRoot);
    assert.equal(escapedOutput.exitCode, 1);
    assert.match(JSON.stringify(escapedOutput.value), /must resolve inside the project root/);

    await writeFile(configPath, JSON.stringify({
      version: 1,
      reports: {
        fixture: {
          source: "source files/report.tsx",
          html: "generated/report.html",
          pdf: "../outside/report.pdf",
          captures: "captures",
        },
      },
    }));
    const escapedPdf = await runCli([], projectRoot);
    assert.equal(escapedPdf.exitCode, 1);
    assert.match(JSON.stringify(escapedPdf.value), /field.*pdf.*must resolve inside the project root/);

    await writeFile(configPath, JSON.stringify({
      version: 1,
      reports: {
        fixture: {
          source: "source files/report.tsx",
          html: "generated/report.html",
          captures: "captures",
          pdfCaptures: "../outside/pdf-pages",
        },
      },
    }));
    const escapedPdfCaptures = await runCli([], projectRoot);
    assert.equal(escapedPdfCaptures.exitCode, 1);
    assert.match(JSON.stringify(escapedPdfCaptures.value), /field.*pdfCaptures.*must resolve inside the project root/);

    await symlink(outsideDirectory, resolve(projectRoot, "linked output"));
    await writeFile(configPath, JSON.stringify({
      version: 1,
      reports: {
        fixture: {
          source: "source files/report.tsx",
          html: "linked output/report.html",
          captures: "captures",
        },
      },
    }));
    const linkedOutput = await runCli([], projectRoot);
    assert.equal(linkedOutput.exitCode, 1);
    assert.match(JSON.stringify(linkedOutput.value), /symbolic link points outside/);

    await writeFile(configPath, JSON.stringify({
      version: 1,
      reports: {
        fixture: {
          source: "source files/report.tsx",
          html: "generated/report.html",
          captures: "generated",
        },
      },
    }));
    const overlappingOutputs = await runCli([], projectRoot);
    assert.equal(overlappingOutputs.exitCode, 1);
    assert.match(JSON.stringify(overlappingOutputs.value), /field.*html.*overlaps.*field.*captures/);

    await writeFile(configPath, JSON.stringify({
      version: 1,
      reports: {
        fixture: {
          source: "source files/missing.tsx",
          html: "generated/report.html",
          captures: "captures",
        },
      },
    }));
    const missingSource = await runCli([], projectRoot);
    assert.equal(missingSource.exitCode, 1);
    assert.match(JSON.stringify(missingSource.value), /source does not exist/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(outsideDirectory, { recursive: true, force: true });
  }
});
