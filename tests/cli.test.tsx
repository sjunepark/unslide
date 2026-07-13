import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { decode } from "@toon-format/toon";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(".");
const cliPath = resolve("src/cli.ts");

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
  value: Record<string, unknown>;
}

async function runCli(arguments_: string[], cwd = repositoryRoot): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", cliPath, ...arguments_],
      { cwd },
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
          "body{margin:0}[data-unslide-page]{width:320px;height:180px;background:white}"
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

  for (const result of [
    await runCli(["unknown"]),
    await runCli(["build"]),
    await runCli(["capture", "fixture", "extra"]),
    await runCli(["build", "fixture", "--wat"]),
    await runCli(["build", "--artifact"]),
    await runCli(["capture", "--artifact", "report.html"]),
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
