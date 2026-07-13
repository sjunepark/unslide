import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { decode, encode } from "@toon-format/toon";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(".");
const cliPath = resolve("src/cli.ts");
const tsxImport = import.meta.resolve("tsx");

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
      { cwd, env: { ...process.env, ...environment } },
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

function stableTopHelp() {
  return {
    bin: "/opt/unslide/bin/unslide",
    description: "Build and inspect explicit-page HTML and PDF reports",
    usage: "unslide <command>",
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
      { cwd: repositoryRoot },
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
  assert.equal(help.value.usage, "pnpm --silent run unslide <command>");

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

  for (const result of [
    await runCli(["unknown"]),
    await runCli(["build"]),
    await runCli(["capture", "fixture", "extra"]),
    await runCli(["build", "fixture", "--wat"]),
    await runCli(["build", "--artifact"]),
    await runCli(["capture", "--artifact", "report.html"]),
    await runCli(["inspect-pdf", "--artifact", "report.pdf"]),
    await runCli(["inspect-pdf", "--output", "pages"]),
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
            flags: [],
            examples: ["unslide build spike", "unslide build operating-review"],
          },
        }),
      },
    );

    const missingProject = await runCli([], externalRoot, stableCliEnvironment);
    const missingMessage = `No unslide.json found from ${canonicalExternalRoot} or its parent directories.`;
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
        stdout: encode({ error: { code: "operation-failed", message: missingMessage } }),
      },
    );

    const externalConfigPath = resolve(externalRoot, "unslide.json");
    await mkdir(externalConfigPath);
    const unreadableConfig = await runCli([], externalRoot, stableCliEnvironment);
    assert.equal(unreadableConfig.exitCode, 1);
    assert.equal(unreadableConfig.stderr, "");
    assert.equal((unreadableConfig.value.error as Record<string, unknown>).code, "operation-failed");
    assert.match(String((unreadableConfig.value.error as Record<string, unknown>).message), /^Cannot read .*unslide\.json:/);
    assert.doesNotMatch(String((unreadableConfig.value.error as Record<string, unknown>).message), /^Cannot parse /);

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
            code: "operation-failed",
            message: "Unsupported unslide.json version 2. This release supports version 1; update the configuration manually because automatic migration is not available.",
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
        stdout: encode({ error: { code: "operation-failed", message: 'Unknown report "missing". Available reports: fixture.' } }),
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
            code: "operation-failed",
            message: 'Artifact readiness failed:\nNo report pages found. Expected at least one element with data-unslide-page="<id>".',
          },
        }),
      },
    );
  } finally {
    await rm(externalRoot, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
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
    assert.equal((conflict.value.error as Record<string, unknown>).code, "file-conflict");
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

    const capture = await runCli(["capture", "fixture"], projectRoot);
    assert.equal(capture.exitCode, 0);
    assert.equal(capture.stderr, "");
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
    assert.match(JSON.stringify(missing.value), /Unknown report.*fixture/);

    const inheritedName = await runCli(["build", "constructor"], projectRoot);
    assert.equal(inheritedName.exitCode, 1);
    assert.match(JSON.stringify(inheritedName.value), /Unknown report.*fixture/);

    await writeFile(configPath, JSON.stringify({ version: 2, reports: {} }));
    const unsupportedVersion = await runCli([], projectRoot);
    assert.equal(unsupportedVersion.exitCode, 1);
    assert.match(JSON.stringify(unsupportedVersion.value), /Unsupported unslide\.json version 2.*automatic migration is not available/);

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
