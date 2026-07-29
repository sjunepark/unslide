import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { decode, encode } from "@toon-format/toon";
import { Cause } from "effect";
import { combineCliFailures, CommandFailure } from "../src/unslide/failures.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(".");
const cliPath = resolve("src/cli.ts");
const tsxImport = import.meta.resolve("tsx");
const repositoryManifest = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
) as { version: string };

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
  value: Record<string, unknown>;
}

function decodeResult(arguments_: readonly string[], stdout: string): Record<string, unknown> {
  const formatIndexes = arguments_.flatMap((argument, index) =>
    argument === "--format" ? [index] : [],
  );
  const format =
    formatIndexes.length === 1 ? arguments_[(formatIndexes[0] as number) + 1] : undefined;
  return format === "json"
    ? (JSON.parse(stdout) as Record<string, unknown>)
    : (decode(stdout) as Record<string, unknown>);
}

async function runCli(
  arguments_: string[],
  cwd = repositoryRoot,
  environment: NodeJS.ProcessEnv = {},
): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", tsxImport, cliPath, ...arguments_],
      { cwd, env: { ...process.env, UNSLIDE_LOG_LEVEL: "off", ...environment } },
    );
    return { exitCode: 0, stderr, stdout, value: decodeResult(arguments_, stdout) };
  } catch (error) {
    const failure = error as Error & { code: number; stderr: string; stdout: string };
    return {
      exitCode: failure.code,
      stderr: failure.stderr,
      stdout: failure.stdout,
      value: decodeResult(arguments_, failure.stdout),
    };
  }
}

const stableCliEnvironment = {
  UNSLIDE_BIN: "/opt/unslide/bin/unslide",
  UNSLIDE_INVOCATION: "unslide",
};

const stableFullFlag = {
  flag: "--full",
  description:
    "Show complete report-authored diagnostics (default: up to 10 issues and 1,000 characters per text field)",
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
    : stderr
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as EffectLogEntry);
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

async function createProject(prefix = "unslide cli project ", pageCount = 1): Promise<string> {
  await mkdir(resolve(repositoryRoot, ".tmp"), { recursive: true });
  const projectRoot = await mkdtemp(resolve(repositoryRoot, ".tmp", prefix));
  await mkdir(resolve(projectRoot, "source files"), { recursive: true });
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const id = pageCount === 1 ? "fixture" : `fixture-${index + 1}`;
    return `<main data-unslide-page="${id}">CLI fixture ${index + 1}</main>`;
  }).join("");
  await writeFile(
    resolve(projectRoot, "source files", "report.tsx"),
    `
    import React from "react";

    export default (
      <html lang="en">
        <head><meta name="unslide-protocol" content="1" /><title>CLI fixture</title><style>{
          "@page{size:320px 180px;margin:0}body{margin:0}[data-unslide-page]{width:320px;height:180px;background:white;break-after:page}[data-unslide-page]:last-child{break-after:auto}"
        }</style></head>
        <body>${pages}</body>
      </html>
    );
  `,
  );
  await writeFile(
    resolve(projectRoot, "unslide.json"),
    JSON.stringify(
      {
        version: 1,
        reports: {
          fixture: {
            source: "source files/report.tsx",
            html: "generated output/report file.html",
            captures: "captured pages",
          },
        },
      },
      null,
      2,
    ),
  );
  return projectRoot;
}

test("CLI help and usage errors are structured, noninteractive, and stable", async () => {
  const help = await runCli(["--help"]);
  assert.equal(help.exitCode, 0);
  assert.equal(help.stderr, "");
  assert.equal(help.value.resultSchemaVersion, 1);
  assert.equal(help.value.status, "ok");
  assert.equal(help.stdout.endsWith("\n"), true);
  const helpResult = help.value.result as Record<string, unknown>;
  assert.equal(helpResult.kind, "help");
  assert.match(String(helpResult.usage), /src\/cli\.ts/);

  const commandHelp = await runCli(["capture", "--help"]);
  assert.equal(commandHelp.exitCode, 0);
  assert.equal(commandHelp.stderr, "");
  assert.match(
    String((commandHelp.value.result as Record<string, unknown>).usage),
    /capture <name>/,
  );

  const exportHelp = await runCli(["export", "--help"]);
  assert.equal(exportHelp.exitCode, 0);
  assert.match(String((exportHelp.value.result as Record<string, unknown>).usage), /export <name>/);

  const pdfInspectionHelp = await runCli(["inspect-pdf", "--help"]);
  assert.equal(pdfInspectionHelp.exitCode, 0);
  assert.match(
    String((pdfInspectionHelp.value.result as Record<string, unknown>).usage),
    /inspect-pdf/,
  );

  for (const command of ["build", "inspect", "capture", "export", "inspect-pdf", "init"]) {
    const result = await runCli([command, "--help"], repositoryRoot, stableCliEnvironment);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    const commandResult = result.value.result as Record<string, unknown>;
    assert.ok(
      (commandResult.flags as unknown[]).some((flag) =>
        String((flag as Record<string, unknown>).flag).startsWith("--format"),
      ),
    );
    assert.ok(
      (commandResult.flags as unknown[]).some((flag) =>
        String((flag as Record<string, unknown>).flag).startsWith("--log-level"),
      ),
    );
  }

  for (const command of ["inspect", "capture", "export"]) {
    const result = await runCli([command, "--help"], repositoryRoot, stableCliEnvironment);
    assert.ok(
      ((result.value.result as Record<string, unknown>).flags as unknown[]).some(
        (flag) => (flag as Record<string, unknown>).flag === stableFullFlag.flag,
      ),
    );
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
    await runCli(["build", "report", "--full"]),
    await runCli(["inspect-pdf", "report", "--full"]),
    await runCli(["init", "--full"]),
    await runCli(["--format=toon", "--help"]),
    await runCli(["--format", "toon", "--format", "json", "--help"]),
    await runCli(["--format", "json", "--format", "toon", "--help"]),
    await runCli(["--format", "--help"]),
    await runCli(["--wat"]),
  ]) {
    assert.equal(result.exitCode, 2);
    assert.equal(result.stderr, "");
    assert.equal(result.value.status, "error");
    assert.equal((result.value.error as Record<string, unknown>).code, "usage");
    assert.ok((result.value.help as unknown[]).length > 0);
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
    assert.equal(
      (pathInvocation.value.result as Record<string, unknown> as { usage: string }).usage,
      "unslide build <name>",
    );

    const directInvocation = await runCli(["build", "--help"], repositoryRoot, {
      PATH: process.env.PATH,
      UNSLIDE_BIN: spacedExecutable,
      UNSLIDE_INVOCATION: undefined,
      npm_lifecycle_event: undefined,
    });
    assert.equal(
      (directInvocation.value.result as Record<string, unknown> as { usage: string }).usage,
      `${shellQuote(spacedExecutable)} build <name>`,
    );

    for (const [userAgent, expected] of [
      [undefined, "pnpm --silent run unslide build <name>"],
      ["pnpm/11.12.0 npm/? node/v24.15.0", "pnpm --silent run unslide build <name>"],
      ["npm/11.4.2 node/v24.15.0", "npm --silent run unslide build <name>"],
      ["yarn/1.22.22 npm/? node/v24.15.0", "yarn --silent run unslide build <name>"],
    ] as const) {
      const repositoryInvocation = await runCli(["build", "--help"], repositoryRoot, {
        UNSLIDE_BIN: spacedExecutable,
        UNSLIDE_INVOCATION: undefined,
        npm_config_user_agent: userAgent,
        npm_lifecycle_event: "unslide",
      });
      assert.equal(
        (repositoryInvocation.value.result as Record<string, unknown> as { usage: string }).usage,
        expected,
      );
    }

    assert.equal(
      await realpath(pathExecutable),
      await realpath(resolve(repositoryRoot, "bin/unslide.mjs")),
    );
    assert.equal(
      await realpath(spacedExecutable),
      await realpath(resolve(repositoryRoot, "bin/unslide.mjs")),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("home output reports HTML existence and contextual next actions", async () => {
  const projectRoot = await createProject("unslide home output ");
  const configPath = resolve(projectRoot, "unslide.json");
  const source = "source files/report.tsx";
  await writeFile(
    configPath,
    JSON.stringify(
      {
        version: 1,
        reports: {
          alpha: { source, html: "generated output/alpha.html", captures: "captures/alpha" },
          bravo: { source, html: "generated output/bravo.html", captures: "captures/bravo" },
        },
      },
      null,
      2,
    ),
  );

  try {
    const missing = await runCli([], projectRoot, stableCliEnvironment);
    const missingHome = missing.value.result as Record<string, unknown>;
    assert.equal(missingHome.kind, "home");
    assert.equal(missingHome.projectRoot, projectRoot);
    const missingReports = missingHome.reports as Array<Record<string, unknown>>;
    assert.deepEqual(
      missingReports.map((report) => report.name),
      ["alpha", "bravo"],
    );
    assert.ok(missingReports.every((report) => !(report.html as { exists: boolean }).exists));
    assert.ok(
      missingReports.every((report) =>
        String((report.source as { path: string }).path).startsWith(projectRoot),
      ),
    );
    assert.deepEqual(missing.value.help, ["Run unslide build <name>", "Run unslide --help"]);

    await mkdir(resolve(projectRoot, "generated output"), { recursive: true });
    await writeFile(resolve(projectRoot, "generated output/alpha.html"), "existing HTML");
    const mixed = await runCli([], projectRoot, stableCliEnvironment);
    const mixedReports = (mixed.value.result as Record<string, unknown>).reports as Array<
      Record<string, unknown>
    >;
    assert.deepEqual(
      mixedReports.map((report) => (report.html as { exists: boolean }).exists),
      [true, false],
    );
    assert.deepEqual(mixed.value.help, [
      "Run unslide build <name>",
      "Run unslide inspect <name>",
      "Run unslide capture <name>",
    ]);

    await writeFile(resolve(projectRoot, "generated output/bravo.html"), "existing HTML");
    const present = await runCli([], projectRoot, stableCliEnvironment);
    const presentReports = (present.value.result as Record<string, unknown>).reports as Array<
      Record<string, unknown>
    >;
    assert.ok(presentReports.every((report) => (report.html as { exists: boolean }).exists));
    assert.deepEqual(present.value.help, [
      "Run unslide inspect <name>",
      "Run unslide capture <name>",
    ]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("global Effect logging is opt-in, structured, and configurable by flag or environment", async () => {
  const info = await runCli(
    ["--log-level", "info", "--help"],
    repositoryRoot,
    stableCliEnvironment,
  );
  assert.equal(info.exitCode, 0);
  assert.equal(info.stdout, `${encode(info.value)}\n`);
  assert.match(String((info.value.result as Record<string, unknown>).usage), /^unslide /);
  const infoLogs = parseLogs(info.stderr);
  assert.deepEqual(
    infoLogs.map((entry) => entry.message),
    ["invocation.started", "invocation.completed"],
  );
  assert.ok(infoLogs.every((entry) => entry.level === "INFO"));
  assert.ok(infoLogs.every((entry) => entry.annotations.command === "help"));
  assert.equal(new Set(infoLogs.map((entry) => entry.annotations.invocationId)).size, 1);
  assert.ok(infoLogs.every((entry) => Number.isFinite(Date.parse(entry.timestamp))));

  const environment = await runCli(["--help"], repositoryRoot, {
    ...stableCliEnvironment,
    UNSLIDE_LOG_LEVEL: "info",
  });
  assert.equal(parseLogs(environment.stderr).length, 2);

  const rejected = await runCli(
    ["build", "--log-level", "info"],
    repositoryRoot,
    stableCliEnvironment,
  );
  assert.equal(rejected.exitCode, 2);
  assert.ok(
    parseLogs(rejected.stderr).some(
      (entry) => entry.message === "invocation.rejected" && entry.annotations.exitCode === 2,
    ),
  );

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
    await runCli(
      ["--log-level", "info", "--help", "--log-level", "debug"],
      repositoryRoot,
      stableCliEnvironment,
    ),
    await runCli(["--help"], repositoryRoot, {
      ...stableCliEnvironment,
      UNSLIDE_LOG_LEVEL: "TRACE",
    }),
  ]) {
    assert.equal(result.exitCode, 2);
    assert.equal(result.stderr, "");
    assert.equal((result.value.error as Record<string, unknown>).code, "usage");
  }
});

test("logging keeps stable failures on info and adds full Effect causes on debug", async () => {
  const projectRoot = await createProject("unslide logging failures ");
  try {
    const info = await runCli(
      ["build", "missing", "--log-level", "info"],
      projectRoot,
      stableCliEnvironment,
    );
    assert.equal(info.exitCode, 1);
    assert.equal((info.value.error as Record<string, unknown>).code, "report-not-found");
    const infoLogs = parseLogs(info.stderr);
    const infoFailure = infoLogs.find((entry) => entry.message === "invocation.failed");
    assert.equal(infoFailure?.level, "ERROR");
    assert.equal(infoFailure?.annotations.errorTag, "ReportNotFound");
    assert.equal(infoFailure?.annotations.errorMessage, "Report lookup failed.");
    assert.equal(
      infoLogs.some((entry) => entry.message === "failure.cause"),
      false,
    );

    const debug = await runCli(
      ["--log-level", "debug", "build", "missing"],
      projectRoot,
      stableCliEnvironment,
    );
    assert.equal(debug.exitCode, 1);
    assert.deepEqual({ ...debug.value, timings: [] }, { ...info.value, timings: [] });
    const debugLogs = parseLogs(debug.stderr);
    const cause = debugLogs.find((entry) => entry.message === "failure.cause");
    assert.equal(cause?.level, "DEBUG");
    assert.match(cause?.cause ?? "", /Unknown report "missing"/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("CLI root emits one versioned document and maps every tagged failure", async () => {
  const externalRoot = await mkdtemp(resolve(tmpdir(), "unslide-cli-boundary-"));
  const canonicalExternalRoot = await realpath(externalRoot);
  const projectRoot = await createProject("unslide failure mapping ");
  try {
    for (const format of ["toon", "json"] as const) {
      const help = await runCli(
        ["--format", format, "--help"],
        repositoryRoot,
        stableCliEnvironment,
      );
      assert.equal(help.exitCode, 0);
      assert.equal(help.stderr, "");
      assert.equal(help.stdout.endsWith("\n"), true);
      assert.equal(help.stdout.endsWith("\n\n"), false);
      assert.equal(help.value.resultSchemaVersion, 1);
      assert.equal(help.value.toolVersion, repositoryManifest.version);
      assert.equal(help.value.command, "help");
      assert.equal(help.value.status, "ok");
      assert.deepEqual(help.value.warnings, []);
      assert.deepEqual(help.value.timings, []);
      assert.deepEqual(help.value.help, []);
    }

    const usage = await runCli(["build"], repositoryRoot, stableCliEnvironment);
    assert.equal(usage.exitCode, 2);
    assert.equal(usage.stderr, "");
    assert.equal(usage.value.status, "error");
    assert.deepEqual(usage.value.error, {
      code: "usage",
      message: "build requires exactly one report name.",
    });

    const missingProject = await runCli([], externalRoot, stableCliEnvironment);
    const missingMessage = `No unslide.json project configuration was found from ${canonicalExternalRoot}.`;
    assert.equal(missingProject.exitCode, 1);
    assert.equal(missingProject.stderr, "");
    assert.deepEqual(missingProject.value.error, {
      code: "project-not-found",
      message: missingMessage,
    });
    assert.deepEqual(missingProject.value.help, ["Run unslide init"]);

    const namedMissingProject = await runCli(
      ["build", "fixture"],
      externalRoot,
      stableCliEnvironment,
    );
    assert.equal(namedMissingProject.exitCode, 1);
    assert.deepEqual(namedMissingProject.value.error, missingProject.value.error);

    const externalConfigPath = resolve(externalRoot, "unslide.json");
    const canonicalExternalConfigPath = resolve(canonicalExternalRoot, "unslide.json");
    await mkdir(externalConfigPath);
    const unreadableConfig = await runCli([], externalRoot, stableCliEnvironment);
    assert.equal(unreadableConfig.exitCode, 1);
    assert.equal(unreadableConfig.stderr, "");
    assert.deepEqual(
      {
        code: (unreadableConfig.value.error as Record<string, unknown>).code,
        message: (unreadableConfig.value.error as Record<string, unknown>).message,
        path: (unreadableConfig.value.error as Record<string, unknown>).path,
      },
      {
        code: "project-config-unreadable",
        message: "Project configuration cannot be read.",
        path: canonicalExternalConfigPath,
      },
    );

    await rm(externalConfigPath, { recursive: true });
    await writeFile(externalConfigPath, '{"version": 1, "reports":');
    const malformedConfig = await runCli([], externalRoot, stableCliEnvironment);
    assert.equal(malformedConfig.exitCode, 1);
    assert.equal(malformedConfig.stderr, "");
    assert.deepEqual(
      {
        code: (malformedConfig.value.error as Record<string, unknown>).code,
        message: (malformedConfig.value.error as Record<string, unknown>).message,
        path: (malformedConfig.value.error as Record<string, unknown>).path,
      },
      {
        code: "project-config-invalid",
        message: "Project configuration is invalid.",
        path: canonicalExternalConfigPath,
      },
    );
    assert.match(
      String((malformedConfig.value.error as Record<string, unknown>).detail),
      /JSON|position|end of data/i,
    );

    await writeFile(externalConfigPath, JSON.stringify({ version: 2, reports: {} }));
    const invalidConfig = await runCli([], externalRoot, stableCliEnvironment);
    assert.equal(invalidConfig.exitCode, 1);
    assert.match(JSON.stringify(invalidConfig.value.error), /Unsupported unslide\.json version 2/);

    const missingReport = await runCli(["build", "missing"], projectRoot, stableCliEnvironment);
    assert.equal(missingReport.exitCode, 1);
    assert.deepEqual(missingReport.value.error, {
      code: "report-not-found",
      message: 'Report "missing" is not configured.',
      availableReports: ["fixture"],
    });
    assert.deepEqual(missingReport.value.help, ["Run unslide build <name>"]);

    const missingReportWithFull = await runCli(
      ["capture", "missing", "--full"],
      projectRoot,
      stableCliEnvironment,
    );
    assert.deepEqual(missingReportWithFull.value.help, ["Run unslide capture <name>"]);

    const invalidArtifact = await runCli(
      ["inspect", "--artifact", resolve(repositoryRoot, "tests/fixtures/protocol-no-pages.html")],
      repositoryRoot,
      stableCliEnvironment,
    );
    assert.equal(invalidArtifact.exitCode, 1);
    const invalidError = invalidArtifact.value.error as Record<string, unknown>;
    assert.equal(invalidError.code, "artifact-invalid");
    assert.equal(invalidError.path, resolve("tests/fixtures/protocol-no-pages.html"));
    assert.deepEqual(
      (
        (invalidError.diagnostics as Record<string, unknown>).issues as Array<
          Record<string, unknown>
        >
      ).map((issue) => issue.code),
      ["missing-pages"],
    );
  } finally {
    await rm(externalRoot, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("format selection, source details, and authored console output stay automation-safe", async () => {
  for (const arguments_ of [
    ["--format=json", "--help"],
    ["--format", "json", "--format", "toon", "--help"],
    ["--format", "json", "--format", "json", "--help"],
  ]) {
    const fallback = await runCli(arguments_);
    assert.equal(fallback.exitCode, 2);
    assert.doesNotThrow(() => decode(fallback.stdout, { strict: true }));
    assert.throws(() => JSON.parse(fallback.stdout));
  }
  const malformedFormat = await runCli(["--format", "yaml", "--help"]);
  assert.equal(malformedFormat.exitCode, 2);
  assert.equal(malformedFormat.value.status, "error");
  assert.equal((malformedFormat.value.error as Record<string, unknown>).code, "usage");

  const jsonUsage = await runCli(["build", "--format", "json"]);
  assert.equal(jsonUsage.exitCode, 2);
  assert.equal(jsonUsage.value.status, "error");
  assert.doesNotThrow(() => JSON.parse(jsonUsage.stdout));
  assert.deepEqual(jsonUsage.value.help, [`Run ${shellQuote(cliPath)} --format json build report`]);

  const projectRoot = await createProject("unslide source channels ");
  const sourcePath = resolve(projectRoot, "source files", "report.tsx");
  const htmlPath = resolve(projectRoot, "generated output", "report file.html");
  try {
    await writeFile(
      sourcePath,
      `import React from "react";
console.log("authored stdout attempt", { source: "fixture" });
console.error("authored stderr attempt");
console.warn(${JSON.stringify("W".repeat(1_205))});
queueMicrotask(() => console.info("authored microtask attempt"));
setTimeout(() => console.log("delayed authored stdout attempt"), 100);
const unkeyed = [<span>first</span>, <span>second</span>];
export default <html><head><meta name="unslide-protocol" content="1" /></head><body><main data-unslide-page="safe">Safe channels{unkeyed}</main></body></html>;
`,
    );
    for (const format of ["toon", "json"] as const) {
      const built = await runCli(["build", "fixture", "--format", format], projectRoot);
      assert.equal(built.exitCode, 0, built.stdout);
      assert.equal(built.stderr, "");
      assert.equal(built.value.status, "ok");
      assert.doesNotMatch(built.stdout, /authored (?:stdout|stderr) attempt/);
    }
    const debug = await runCli(
      ["build", "fixture", "--log-level", "debug"],
      projectRoot,
      stableCliEnvironment,
    );
    const consoleLogs = parseLogs(debug.stderr).filter(
      (entry) => entry.message === "report.console",
    );
    assert.deepEqual(
      new Set(consoleLogs.map((entry) => entry.annotations.level)),
      new Set(["log", "error", "warn", "info"]),
    );
    const truncatedWarning = consoleLogs.find(
      (entry) => entry.annotations.level === "warn" && entry.annotations.messageTotalChars,
    );
    assert.ok(truncatedWarning);
    assert.equal([...(truncatedWarning.annotations.message as string)].length, 1_000);
    assert.equal(truncatedWarning.annotations.messageTotalChars, 1_205);
    assert.ok(
      consoleLogs.some(
        (entry) => entry.annotations.phase === "render" && entry.annotations.level === "error",
      ),
    );

    const priorHtml = await readFile(htmlPath, "utf8");
    await writeFile(
      sourcePath,
      `import React, { readTextAsset } from "unslide/react";
const css = await readTextAsset(new URL("./missing.css", import.meta.url).pathname);
export default <html><head><style>{css}</style></head><body><main data-unslide-page="broken">Broken</main></body></html>;
`,
    );
    const missingAsset = await runCli(["build", "fixture"], projectRoot);
    assert.equal(missingAsset.exitCode, 1);
    const assetError = missingAsset.value.error as Record<string, unknown>;
    assert.equal(assetError.code, "command-failed");
    assert.match(String(assetError.detail), /Cannot read local text asset.*missing\.css/);
    assert.ok([...String(assetError.detail)].length <= 1_000);
    assert.equal(await readFile(htmlPath, "utf8"), priorHtml);

    await writeFile(
      sourcePath,
      `throw new Error("Stylesheet compilation failed: invalid authored selector");\nexport default null;\n`,
    );
    const stylesheetFailure = await runCli(["build", "fixture"], projectRoot);
    assert.equal(stylesheetFailure.exitCode, 1);
    assert.match(
      String((stylesheetFailure.value.error as Record<string, unknown>).detail),
      /Stylesheet compilation failed: invalid authored selector/,
    );
    assert.equal(await readFile(htmlPath, "utf8"), priorHtml);

    await writeFile(sourcePath, "export default <html><body><main>unterminated");
    const compileFailure = await runCli(["build", "fixture", "--format", "json"], projectRoot);
    assert.equal(compileFailure.exitCode, 1);
    assert.match(
      String((compileFailure.value.error as Record<string, unknown>).detail),
      /Cannot load source[\s\S]*report\.tsx/,
    );
    assert.equal(await readFile(htmlPath, "utf8"), priorHtml);

    await writeFile(sourcePath, "export default { report: true };\n");
    const invalidExport = await runCli(["build", "fixture"], projectRoot);
    assert.equal(invalidExport.exitCode, 1);
    assert.match(
      String((invalidExport.value.error as Record<string, unknown>).detail),
      /must export one complete React document/,
    );

    await writeFile(
      sourcePath,
      `throw new Error(${JSON.stringify("D".repeat(1_205))});\nexport default null;\n`,
    );
    const boundedAuthorDetail = await runCli(["build", "fixture", "--format", "json"], projectRoot);
    assert.equal(boundedAuthorDetail.exitCode, 1);
    assert.equal(
      [...String((boundedAuthorDetail.value.error as Record<string, unknown>).detail)].length,
      1_000,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("operational failures use stable codes, corrective commands, and diagnostic-only raw causes", async () => {
  const projectRoot = await createProject("unslide operational failures ");
  const htmlPath = resolve(projectRoot, "generated output", "report file.html");
  const pdfPath = resolve(projectRoot, "generated output", "report file.pdf");
  const missingBrowsers = await mkdtemp(
    resolve(repositoryRoot, ".tmp", "unslide missing browsers "),
  );
  const brokenBrowsers = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide broken browsers "));

  try {
    for (const command of ["inspect", "capture", "export"]) {
      const result = await runCli([command, "fixture"], projectRoot, stableCliEnvironment);
      assert.equal(result.exitCode, 1);
      assert.equal(result.stderr, "");
      assert.deepEqual(result.value.error, {
        code: "artifact-not-found",
        message: "HTML artifact was not found.",
        report: "fixture",
        path: htmlPath,
      });
      assert.deepEqual(result.value.help, ["Run unslide build fixture"]);
    }

    const missingPdf = await runCli(["inspect-pdf", "fixture"], projectRoot, stableCliEnvironment);
    assert.equal(missingPdf.exitCode, 1);
    assert.equal(missingPdf.stderr, "");
    assert.deepEqual(missingPdf.value.error, {
      code: "artifact-not-found",
      message: "PDF artifact was not found.",
      report: "fixture",
      path: pdfPath,
    });
    assert.deepEqual(missingPdf.value.help, ["Run unslide export fixture"]);

    await mkdir(dirname(htmlPath), { recursive: true });
    await writeFile(
      htmlPath,
      await readFile(resolve(repositoryRoot, "tests/fixtures/protocol-no-pages.html")),
    );
    const invalidHtml = await runCli(["inspect", "fixture"], projectRoot, stableCliEnvironment);
    assert.equal(invalidHtml.exitCode, 1);
    assert.equal(invalidHtml.stderr, "");
    const invalidHtmlError = invalidHtml.value.error as Record<string, unknown>;
    assert.equal(invalidHtmlError.code, "artifact-invalid");
    assert.equal(invalidHtmlError.report, "fixture");
    assert.equal(invalidHtmlError.path, htmlPath);
    assert.equal((invalidHtmlError.diagnostics as Record<string, unknown>).total, 1);
    assert.deepEqual(invalidHtml.value.help, ["Run unslide build fixture"]);

    await writeFile(
      htmlPath,
      '<!doctype html><html><body><main data-unslide-page="hidden" style="display:none">Hidden</main></body></html>',
    );
    const invalidCaptureGeometry = await runCli(
      ["capture", "fixture"],
      projectRoot,
      stableCliEnvironment,
    );
    assert.equal(invalidCaptureGeometry.exitCode, 1);
    assert.equal(invalidCaptureGeometry.stderr, "");
    assert.equal(
      (invalidCaptureGeometry.value.error as Record<string, unknown>).code,
      "artifact-invalid",
    );
    assert.deepEqual(invalidCaptureGeometry.value.help, ["Run unslide build fixture"]);

    await writeFile(
      htmlPath,
      '<!doctype html><html><body><main data-unslide-page="page">No print geometry</main></body></html>',
    );
    const invalidPrintCss = await runCli(["export", "fixture"], projectRoot, stableCliEnvironment);
    assert.equal(invalidPrintCss.exitCode, 1);
    assert.equal(invalidPrintCss.stderr, "");
    assert.equal((invalidPrintCss.value.error as Record<string, unknown>).code, "artifact-invalid");
    assert.deepEqual(invalidPrintCss.value.help, ["Run unslide build fixture"]);

    await writeFile(
      htmlPath,
      `<!doctype html><html><head><style>
      @page { size: 4in 3in; margin: 0 }
      body { margin: 0 }
      main, aside { width: 4in; height: 3in }
      main { break-after: page }
    </style></head><body><main data-unslide-page="one">Marked page</main><aside>Extra page</aside></body></html>`,
    );
    const invalidGeneratedPdf = await runCli(
      ["export", "fixture"],
      projectRoot,
      stableCliEnvironment,
    );
    assert.equal(invalidGeneratedPdf.exitCode, 1);
    assert.equal(invalidGeneratedPdf.stderr, "");
    assert.equal(
      (invalidGeneratedPdf.value.error as Record<string, unknown>).code,
      "artifact-invalid",
    );
    assert.equal((invalidGeneratedPdf.value.error as Record<string, unknown>).report, "fixture");
    assert.deepEqual(invalidGeneratedPdf.value.help, ["Run unslide export fixture"]);
    const pdfDiagnostics = (invalidGeneratedPdf.value.error as Record<string, unknown>)
      .diagnostics as Record<string, unknown>;
    assert.deepEqual(
      {
        shown: pdfDiagnostics.shown,
        total: pdfDiagnostics.total,
        truncated: pdfDiagnostics.truncated,
      },
      { shown: 1, total: 1, truncated: false },
    );
    assert.deepEqual(
      (pdfDiagnostics.issues as Array<Record<string, unknown>>).map(({ source, code }) => ({
        source,
        code,
      })),
      [{ source: "pdf", code: "pdf-validation" }],
    );
    assert.match(
      JSON.stringify(pdfDiagnostics),
      /PDF page count 2 does not match the 1 marked HTML pages/,
    );

    await writeFile(pdfPath, "not a PDF");
    const invalidPdf = await runCli(["inspect-pdf", "fixture"], projectRoot, stableCliEnvironment);
    assert.equal(invalidPdf.exitCode, 1);
    assert.equal(invalidPdf.stderr, "");
    assert.equal((invalidPdf.value.error as Record<string, unknown>).code, "artifact-invalid");
    assert.equal((invalidPdf.value.error as Record<string, unknown>).report, "fixture");
    assert.equal((invalidPdf.value.error as Record<string, unknown>).path, pdfPath);
    assert.deepEqual(invalidPdf.value.help, ["Run unslide export fixture"]);

    await writeFile(
      htmlPath,
      await readFile(resolve(repositoryRoot, "tests/fixtures/protocol-valid.html")),
    );
    const browserMissing = await runCli(["capture", "fixture"], projectRoot, {
      ...stableCliEnvironment,
      PLAYWRIGHT_BROWSERS_PATH: missingBrowsers,
    });
    assert.equal(browserMissing.exitCode, 1);
    assert.equal(browserMissing.stderr, "");
    assert.deepEqual(browserMissing.value.error, {
      code: "browser-not-installed",
      message: "The canonical Chromium browser is not installed.",
    });
    assert.deepEqual(browserMissing.value.help, [
      "Run pnpm dlx playwright@1.61.1 install chromium",
    ]);

    const executableProbe = await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        'import { chromium } from "playwright"; process.stdout.write(chromium.executablePath())',
      ],
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
    const launchError = launchFailure.value.error as Record<string, unknown>;
    assert.equal(launchError.code, "command-failed");
    assert.equal(launchError.message, "capture failed.");
    assert.equal(launchError.report, "fixture");
    assert.equal(launchError.path, htmlPath);

    const debugLaunchFailure = await runCli(
      ["capture", "fixture", "--log-level", "debug"],
      projectRoot,
      {
        ...stableCliEnvironment,
        PLAYWRIGHT_BROWSERS_PATH: brokenBrowsers,
      },
    );
    assert.deepEqual(
      { ...debugLaunchFailure.value, timings: [] },
      { ...launchFailure.value, timings: [] },
    );
    assert.match(
      debugLaunchFailure.stderr,
      /Cannot launch the canonical Chromium browser|BrowserFailure/,
    );

    const fullLaunchFailure = await runCli(["capture", "fixture", "--full"], projectRoot, {
      ...stableCliEnvironment,
      PLAYWRIGHT_BROWSERS_PATH: brokenBrowsers,
    });
    assert.equal(
      (fullLaunchFailure.value.error as Record<string, unknown>).code,
      (launchFailure.value.error as Record<string, unknown>).code,
    );
    assert.equal(fullLaunchFailure.stderr, "");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(missingBrowsers, { recursive: true, force: true });
    await rm(brokenBrowsers, { recursive: true, force: true });
  }
});

test("combined CLI failures retain primary context and every diagnostic", () => {
  const primary = new CommandFailure({
    artifact: "html",
    cause: new Error("first cause"),
    code: "artifact-invalid",
    command: "home",
    issues: [{ code: "first", message: "First issue", source: "protocol" }],
    message: "First failure",
    path: "/reports/first.html",
    report: "first",
  });
  const secondary = new CommandFailure({
    artifact: "html",
    cause: new Error("second cause"),
    code: "artifact-invalid",
    command: "home",
    issues: [{ code: "second", message: "Second issue", source: "browser" }],
    message: "Second failure",
    path: "/reports/second.html",
    report: "second",
  });
  const cause = Cause.combine(Cause.fail(primary), Cause.fail(secondary));

  const combined = combineCliFailures(cause);

  assert.ok(combined instanceof CommandFailure);
  assert.equal(combined.cause, cause);
  assert.deepEqual(
    {
      artifact: combined.artifact,
      code: combined.code,
      command: combined.command,
      path: combined.path,
      report: combined.report,
    },
    {
      artifact: "html",
      code: "artifact-invalid",
      command: "home",
      path: "/reports/first.html",
      report: "first",
    },
  );
  assert.deepEqual(
    combined.issues?.map(({ code }) => code),
    ["first", "second"],
  );
});

test("authored diagnostics are structured and bounded unless --full is requested", async () => {
  const directory = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide diagnostic limits "));
  const artifactPath = resolve(directory, "authored diagnostics.html");
  const longMessage = "M".repeat(1_205);
  const longResource = `data:image/png;base64,${"A".repeat(1_400)}`;
  const consoleErrors = [
    longMessage,
    ...Array.from({ length: 10 }, (_, index) => `console issue ${index + 2}`),
  ];
  await writeFile(
    artifactPath,
    `<!doctype html>
    <html><head><meta name="unslide-protocol" content="2"></head>
    <body><main data-unslide-page="diagnostics">
      <img src="${longResource}">
      <script>${consoleErrors.map((message) => `console.error(${JSON.stringify(message)});`).join("")}</script>
    </main></body></html>`,
  );

  try {
    const bounded = await runCli(
      ["inspect", "--artifact", artifactPath],
      directory,
      stableCliEnvironment,
    );
    assert.equal(bounded.exitCode, 1);
    assert.equal(bounded.stderr, "");
    const boundedDiagnostics = (bounded.value.error as Record<string, unknown>)
      .diagnostics as Record<string, unknown>;
    assert.deepEqual(
      {
        shown: boundedDiagnostics.shown,
        total: boundedDiagnostics.total,
        truncated: boundedDiagnostics.truncated,
      },
      { shown: 10, total: 13, truncated: true },
    );
    const boundedIssues = boundedDiagnostics.issues as Array<Record<string, unknown>>;
    assert.ok(boundedIssues.some((issue) => issue.source === "protocol"));
    assert.ok(boundedIssues.some((issue) => issue.source === "browser"));
    const messageIssue = boundedIssues.find(
      (issue) => issue.code === "console-error" && issue.messageTotalChars,
    );
    assert.ok(messageIssue);
    assert.equal([...(messageIssue.message as string)].length, 1_000);
    assert.equal(messageIssue.messageTotalChars, 1_205);
    const resourceIssue = boundedIssues.find((issue) => issue.resourceTotalChars);
    assert.ok(resourceIssue);
    assert.equal([...(resourceIssue.resource as string)].length, 1_000);
    assert.equal(resourceIssue.resourceTotalChars, [...longResource].length);
    assert.deepEqual(bounded.value.help, [
      `Run unslide inspect --artifact ${shellQuote(artifactPath)} --full`,
    ]);

    const full = await runCli(
      ["inspect", "--artifact", artifactPath, "--full"],
      directory,
      stableCliEnvironment,
    );
    assert.equal(full.exitCode, 1);
    assert.equal(full.stderr, "");
    const fullDiagnostics = (full.value.error as Record<string, unknown>).diagnostics as Record<
      string,
      unknown
    >;
    assert.deepEqual(
      {
        shown: fullDiagnostics.shown,
        total: fullDiagnostics.total,
        truncated: fullDiagnostics.truncated,
      },
      { shown: 13, total: 13, truncated: false },
    );
    const fullIssues = fullDiagnostics.issues as Array<Record<string, unknown>>;
    assert.equal(fullIssues.find((issue) => issue.code === "console-error")?.message, longMessage);
    assert.equal(fullIssues.find((issue) => issue.resource)?.resource, longResource);
    assert.deepEqual(full.value.help, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI init plans writes, applies explicit confirmation, and refuses conflicts", async () => {
  await mkdir(resolve(repositoryRoot, ".tmp"), { recursive: true });
  const projectRoot = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide init project "));
  try {
    const plan = await runCli(["init", "--name", "quarterly-review"], projectRoot);
    assert.equal(plan.exitCode, 0);
    assert.equal(plan.stderr, "");
    assert.equal((plan.value.result as Record<string, unknown>).status, "planned");
    await assert.rejects(readFile(resolve(projectRoot, "unslide.json"), "utf8"), /ENOENT/);

    const creation = await runCli(["init", "--name", "quarterly-review", "--yes"], projectRoot);
    assert.equal(creation.exitCode, 0);
    assert.equal(creation.stderr, "");
    assert.equal((creation.value.result as Record<string, unknown>).status, "created");
    assert.match(
      await readFile(resolve(projectRoot, "quarterly-review.tsx"), "utf8"),
      /data-unslide-page="welcome"/,
    );
    const starterCss = await readFile(resolve(projectRoot, "quarterly-review.css"), "utf8");
    assert.match(starterCss, /Optional starter styling/);
    assert.match(starterCss, /print-color-adjust:\s*exact/);

    const repeat = await runCli(["init", "--name", "quarterly-review", "--yes"], projectRoot);
    assert.equal(repeat.exitCode, 0);
    assert.equal((repeat.value.result as Record<string, unknown>).status, "unchanged");

    await writeFile(resolve(projectRoot, "quarterly-review.css"), "user-owned change\n");
    const conflict = await runCli(["init", "--name", "quarterly-review", "--yes"], projectRoot);
    assert.equal(conflict.exitCode, 1);
    assert.equal(conflict.stderr, "");
    assert.equal((conflict.value.error as Record<string, unknown>).code, "command-failed");
    assert.deepEqual(conflict.value.help, [
      `Run ${shellQuote(cliPath)} init --name quarterly-review --yes after reconciling the conflicting files`,
    ]);
    assert.equal(
      await readFile(resolve(projectRoot, "quarterly-review.css"), "utf8"),
      "user-owned change\n",
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("CLI rejects unsupported arguments and invalid report names", async () => {
  const invalid = [
    await runCli(["init", "--name"]),
    await runCli(["init", "--name", "Quarterly Review"]),
    await runCli(["init", "--yes", "--yes"]),
    await runCli(["init", "--unknown"]),
  ];
  for (const command of ["build", "capture", "export", "inspect", "inspect-pdf"]) {
    invalid.push(await runCli([command, "Bad_Name"]));
    invalid.push(await runCli([command, "Bad_Name", "--help"]));
  }
  for (const result of invalid) {
    assert.equal(result.exitCode, 2, result.stdout);
    assert.equal(result.stderr, "");
    assert.ok(result.value.help);
  }
});

test("CLI discovers a project from nested paths and handles spaces end to end", async () => {
  const projectRoot = await createProject("unslide cli project ", 2);
  const nestedDirectory = resolve(projectRoot, "nested directory", "deeper");
  await mkdir(nestedDirectory, { recursive: true });

  try {
    const home = await runCli([], nestedDirectory);
    assert.equal(home.exitCode, 0);
    assert.equal(home.stderr, "");
    assert.equal((home.value.result as Record<string, unknown>).projectRoot, projectRoot);

    const build = await runCli(["build", "fixture"], nestedDirectory);
    assert.equal(build.exitCode, 0, build.stdout);
    assert.equal(build.stderr, "");
    assert.deepEqual(build.value.help, [
      `Run ${shellQuote(cliPath)} inspect fixture`,
      `Run ${shellQuote(cliPath)} capture fixture`,
    ]);
    assert.match(
      await readFile(resolve(projectRoot, "generated output", "report file.html"), "utf8"),
      /data-unslide-page="fixture-1"/,
    );

    const inspection = await runCli(["inspect", "fixture"], projectRoot);
    assert.equal(inspection.exitCode, 0);
    assert.equal(inspection.stderr, "");
    assert.equal(
      ((inspection.value.result as Record<string, unknown>).pages as unknown[]).length,
      2,
    );

    const capture = await runCli(["capture", "fixture", "--log-level", "debug"], projectRoot);
    assert.equal(capture.exitCode, 0);
    const captureLogs = parseLogs(capture.stderr);
    assert.ok(captureLogs.some((entry) => entry.annotations.phase === "browser.readiness"));
    assert.ok(captureLogs.some((entry) => entry.message === "page.captured"));
    assert.equal(new Set(captureLogs.map((entry) => entry.annotations.invocationId)).size, 1);
    const captureReport = capture.value.result as Record<string, unknown>;
    const capturePages = captureReport.pages as Array<Record<string, unknown>>;
    assert.equal(
      (captureReport.output as Record<string, unknown>).path,
      resolve(projectRoot, "captured pages"),
    );
    assert.equal(capturePages.length, 2);
    assert.deepEqual(
      capturePages.map((page) => page.id),
      ["fixture-1", "fixture-2"],
    );
    assert.deepEqual(
      capturePages.map((page) => page.number),
      [1, 2],
    );
    for (const page of capturePages) {
      await readFile(String(page.path));
    }
    const png = await readFile(resolve(projectRoot, "captured pages", "page-01.png"));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [320, 180]);

    const exported = await runCli(["export", "fixture"], projectRoot);
    assert.equal(exported.exitCode, 0, exported.stdout);
    const exportResult = exported.value.result as Record<string, unknown>;
    assert.equal((exportResult.pages as unknown[]).length, 2);
    assert.equal(
      ((exportResult.pages as Array<Record<string, unknown>>)[0] as Record<string, unknown>)
        .widthPoints,
      240,
    );
    assert.deepEqual(exported.value.help, [`Run ${shellQuote(cliPath)} inspect-pdf fixture`]);
    assert.equal(
      (await readFile(resolve(projectRoot, "generated output", "report file.pdf")))
        .subarray(0, 5)
        .toString(),
      "%PDF-",
    );

    const pdfInspection = await runCli(["inspect-pdf", "fixture"], projectRoot);
    assert.equal(pdfInspection.exitCode, 0, pdfInspection.stdout);
    const pdfReport = pdfInspection.value.result as Record<string, unknown>;
    const pdfPages = pdfReport.pages as Array<Record<string, unknown>>;
    assert.equal(pdfPages.length, 2);
    assert.equal(pdfReport.kind, "inspect-pdf");
    assert.equal(
      (pdfReport.output as Record<string, unknown>).path,
      resolve(projectRoot, "captured pages-pdf"),
    );
    assert.deepEqual(
      pdfPages.map((page) => page.number),
      [1, 2],
    );
    for (const page of pdfPages) {
      await readFile(String(page.path));
    }
    const pdfPng = await readFile(resolve(projectRoot, "captured pages-pdf", "page-01.png"));
    assert.deepEqual([pdfPng.readUInt32BE(16), pdfPng.readUInt32BE(20)], [320, 181]);

    const explicitOutput = resolve(projectRoot, "standalone pdf pages");
    const explicitInspection = await runCli(
      [
        "inspect-pdf",
        "--artifact",
        resolve(projectRoot, "generated output", "report file.pdf"),
        "--output",
        explicitOutput,
      ],
      nestedDirectory,
    );
    assert.equal(explicitInspection.exitCode, 0, explicitInspection.stdout);
    const explicitPdf = explicitInspection.value.result as Record<string, unknown>;
    const explicitPages = explicitPdf.pages as Array<Record<string, unknown>>;
    assert.equal(explicitPages.length, 2);
    assert.equal((explicitPdf.output as Record<string, unknown>).path, explicitOutput);
    assert.deepEqual(
      explicitPages.map((page) => page.number),
      [1, 2],
    );
    for (const page of explicitPages) {
      await readFile(String(page.path));
    }
    assert.equal(
      (await readFile(resolve(explicitOutput, "page-01.png"))).subarray(1, 4).toString(),
      "PNG",
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("CLI inspection accepts a standalone artifact without project configuration", async () => {
  const directory = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide artifact "));
  const artifactPath = resolve(directory, "existing report.html");
  await writeFile(
    artifactPath,
    '<!doctype html><html><body><article data-unslide-page="only">Only</article></body></html>',
  );

  try {
    const result = await runCli(["inspect", "--artifact", artifactPath], directory);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(
      (((result.value.result as Record<string, unknown>).pages as unknown[]) ?? []).length,
      1,
    );
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
    assert.match(
      JSON.stringify(unsupportedVersion.value),
      /project-config-invalid.*Unsupported unslide\.json version 2.*automatic migration is not available/,
    );

    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        reports: {
          fixture: {
            source: "source files/report.tsx",
            html: "generated/report.html",
            captures: "captures",
            pageSize: "A4",
          },
        },
      }),
    );
    const visualField = await runCli([], projectRoot);
    assert.equal(visualField.exitCode, 1);
    assert.match(JSON.stringify(visualField.value), /unknown field.*pageSize/);

    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        reports: {
          fixture: {
            source: "source files/report.tsx",
            html: "../outside/report.html",
            captures: "captures",
          },
        },
      }),
    );
    const escapedOutput = await runCli([], projectRoot);
    assert.equal(escapedOutput.exitCode, 1);
    assert.match(JSON.stringify(escapedOutput.value), /must resolve inside the project root/);

    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        reports: {
          fixture: {
            source: "source files/report.tsx",
            html: "generated/report.html",
            pdf: "../outside/report.pdf",
            captures: "captures",
          },
        },
      }),
    );
    const escapedPdf = await runCli([], projectRoot);
    assert.equal(escapedPdf.exitCode, 1);
    assert.match(
      JSON.stringify(escapedPdf.value),
      /field.*pdf.*must resolve inside the project root/,
    );

    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        reports: {
          fixture: {
            source: "source files/report.tsx",
            html: "generated/report.html",
            captures: "captures",
            pdfCaptures: "../outside/pdf-pages",
          },
        },
      }),
    );
    const escapedPdfCaptures = await runCli([], projectRoot);
    assert.equal(escapedPdfCaptures.exitCode, 1);
    assert.match(
      JSON.stringify(escapedPdfCaptures.value),
      /field.*pdfCaptures.*must resolve inside the project root/,
    );

    await symlink(outsideDirectory, resolve(projectRoot, "linked output"));
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        reports: {
          fixture: {
            source: "source files/report.tsx",
            html: "linked output/report.html",
            captures: "captures",
          },
        },
      }),
    );
    const linkedOutput = await runCli([], projectRoot);
    assert.equal(linkedOutput.exitCode, 1);
    assert.match(JSON.stringify(linkedOutput.value), /symbolic link points outside/);

    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        reports: {
          fixture: {
            source: "source files/report.tsx",
            html: "generated/report.html",
            captures: "generated",
          },
        },
      }),
    );
    const overlappingOutputs = await runCli([], projectRoot);
    assert.equal(overlappingOutputs.exitCode, 1);
    assert.match(
      JSON.stringify(overlappingOutputs.value),
      /field.*html.*overlaps.*field.*captures/,
    );

    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        reports: {
          fixture: {
            source: "source files/missing.tsx",
            html: "generated/report.html",
            captures: "captures",
          },
        },
      }),
    );
    const missingSource = await runCli([], projectRoot);
    assert.equal(missingSource.exitCode, 1);
    assert.match(JSON.stringify(missingSource.value), /source does not exist/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(outsideDirectory, { recursive: true, force: true });
  }
});
