import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { decode } from "@toon-format/toon";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(".");

async function runConsumerCli(consumerRoot: string, arguments_: string[]) {
  const { stdout, stderr } = await execFileAsync("pnpm", ["exec", "unslide", ...arguments_], {
    cwd: consumerRoot,
  });
  assert.equal(stderr, "");
  return decode(stdout) as Record<string, unknown>;
}

test("packed tooling initializes and runs from a clean external consumer", { timeout: 60_000 }, async () => {
  const packageDirectory = await mkdtemp(resolve(tmpdir(), "unslide-adoption-package-"));
  const consumerRoot = await mkdtemp(resolve(tmpdir(), "unslide-adoption-consumer-"));

  try {
    await execFileAsync("pnpm", ["pack", "--pack-destination", packageDirectory], {
      cwd: repositoryRoot,
    });
    const tarballPath = resolve(packageDirectory, "unslide-0.0.0.tgz");
    await writeFile(resolve(consumerRoot, "package.json"), `${JSON.stringify({
      name: "unslide-clean-consumer",
      private: true,
      type: "module",
      packageManager: "pnpm@11.12.0",
      dependencies: { unslide: `file:${tarballPath}` },
    }, null, 2)}\n`);
    await writeFile(resolve(consumerRoot, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n");
    await execFileAsync("pnpm", ["install"], { cwd: consumerRoot });
    await execFileAsync("pnpm", ["install", "--frozen-lockfile"], { cwd: consumerRoot });

    const installedPackage = await realpath(resolve(consumerRoot, "node_modules", "unslide"));
    assert.ok(installedPackage.startsWith(await realpath(consumerRoot)));
    await access(resolve(installedPackage, "schema", "unslide.schema.json"));

    const help = await runConsumerCli(consumerRoot, ["--help"]);
    assert.match(String(help.bin), /\/bin\/unslide\.mjs$/);
    assert.equal(help.usage, "pnpm exec unslide <command>");
    try {
      await runConsumerCli(consumerRoot, []);
      assert.fail("Consumer without configuration unexpectedly showed a project home view");
    } catch (error) {
      const failure = error as Error & { stdout?: string };
      assert.match(failure.stdout ?? "", /project-not-found/);
      assert.match(failure.stdout ?? "", /init/);
    }

    const plan = await runConsumerCli(consumerRoot, ["init"]);
    assert.equal((plan.init as Record<string, unknown>).status, "planned");
    const creation = await runConsumerCli(consumerRoot, ["init", "--yes"]);
    assert.equal((creation.init as Record<string, unknown>).status, "created");
    const repeat = await runConsumerCli(consumerRoot, ["init", "--yes"]);
    assert.equal((repeat.init as Record<string, unknown>).status, "unchanged");
    assert.match(await readFile(resolve(consumerRoot, "report.tsx"), "utf8"), /from "unslide\/react"/);
    await assert.rejects(access(resolve(consumerRoot, "src", "unslide")), /ENOENT/);
    await assert.rejects(access(resolve(consumerRoot, "scripts", "capture.ts")), /ENOENT/);

    const build = await runConsumerCli(consumerRoot, ["build", "report"]);
    assert.equal((build.report as Record<string, unknown>).status, "built");
    const inspection = await runConsumerCli(consumerRoot, ["inspect", "report"]);
    assert.equal((inspection.report as Record<string, unknown>).pageCount, 1);
    const capture = await runConsumerCli(consumerRoot, ["capture", "report"]);
    assert.equal((capture.report as Record<string, unknown>).pageCount, 1);

    const html = await readFile(resolve(consumerRoot, "artifacts", "report.html"), "utf8");
    assert.match(html, /data-unslide-page="welcome"/);
    assert.doesNotMatch(html, /<script|<link[^>]+stylesheet|https?:\/\//);
    const png = await readFile(resolve(consumerRoot, ".tmp", "captures", "report", "page-01.png"));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [960, 540]);
  } finally {
    await rm(packageDirectory, { recursive: true, force: true });
    await rm(consumerRoot, { recursive: true, force: true });
  }
});
