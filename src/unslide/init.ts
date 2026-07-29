import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Cause, Effect, Exit, FileSystem, Path } from "effect";
import { validateProjectConfigContents, type ProjectConfig } from "./config.js";
import {
  commandFailure,
  errorMessage,
  InitOperationFailure,
  type CommandFailureContext,
} from "./failures.js";
import { canonicalizeThroughExistingAncestor, pathsOverlap } from "./paths.js";

export type Starter = "minimal" | "business-report";
export type ProjectOperation = "init" | "add";

export type InitFileState =
  | "create"
  | "created"
  | "unchanged"
  | "conflict"
  | "failed"
  | "not-started";

export interface InitFile {
  path: string;
  relativePath: string;
  state: InitFileState;
}

export interface InitResult {
  operation: ProjectOperation;
  projectRoot: string;
  reportName: string;
  starter: Starter;
  status: "planned" | "created" | "unchanged" | "conflict";
  files: InitFile[];
  sensitiveOutputsIgnored: boolean;
}

interface PlannedFile extends InitFile {
  contents: string;
  preserveExisting?: boolean;
}

const starterStyles = `/* Optional starter styling. Delete this file and its <style> element to start unstyled. */
@page { size: 10in 5.625in; margin: 0; }

* { box-sizing: border-box; }
:root { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
body { margin: 0; background: #e8ece8; color: #163226; font-family: Arial, sans-serif; }
[data-unslide-page] {
  width: 960px;
  height: 540px;
  padding: 72px;
  display: grid;
  align-content: center;
  background: #fffdf7;
}
.eyebrow { margin: 0 0 20px; color: #c64f2f; font-size: 14px; font-weight: 700; letter-spacing: 0.16em; }
h1 { max-width: 700px; margin: 0 0 24px; font-family: Georgia, serif; font-size: 52px; line-height: 1.02; }
p { max-width: 620px; margin: 0; font-size: 20px; line-height: 1.5; }

@media print {
  body { background: white; }
  [data-unslide-page] { break-after: page; }
  [data-unslide-page]:last-child { break-after: auto; }
}
`;

function minimalSource(reportName: string): string {
  return `import React, { readTextAsset } from "unslide/react";

// Optional starter styling: remove this read, the <style> element, and the CSS file to start unstyled.
const styles = await readTextAsset(new URL("./${reportName}.css", import.meta.url));

export default (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="unslide-protocol" content="1" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Untitled report</title>
      <style>{styles}</style>
    </head>
    <body>
      <main data-unslide-page="welcome">
        <p className="eyebrow">UNSLIDE REPORT</p>
        <h1>Replace this page with your report.</h1>
        <p>Edit ${reportName}.tsx and keep every visual decision in your source.</p>
      </main>
    </body>
  </html>
);
`;
}

function businessFiles(reportName: string): Array<{ relativePath: string; contents: string }> {
  return [
    {
      relativePath: `${reportName}.tsx`,
      contents: `export { default } from "./${reportName}/report.js";\n`,
    },
    {
      relativePath: `${reportName}/report.tsx`,
      contents: `/** @jsxRuntime automatic */
import { readTextAsset, type ReportComponent } from "unslide/react";
import { company, reportingPeriod } from "./data.js";
import { pageManifest, renderPage } from "./pages.js";

const styles = await readTextAsset(new URL("./styles.css", import.meta.url));

const BusinessReport: ReportComponent = () => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="unslide-protocol" content="1" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{company} — {reportingPeriod}</title>
      <style>{styles}</style>
    </head>
    <body>{pageManifest.map((page, index) => renderPage(page, index, pageManifest))}</body>
  </html>
);

export default BusinessReport;
`,
    },
    {
      relativePath: `${reportName}/data.ts`,
      contents: `export const company = "Northstar Works";
export const reportingPeriod = "Quarterly business review";
export const highlights = [
  { label: "Revenue", value: "$24.8M", note: "+12% year over year" },
  { label: "Retention", value: "94%", note: "+3 points" },
  { label: "Delivery", value: "97%", note: "On-time commitments" },
] as const;
`,
    },
    {
      relativePath: `${reportName}/pages.tsx`,
      contents: `/** @jsxRuntime automatic */
import type { ReactElement } from "react";
import { company, highlights, reportingPeriod } from "./data.js";

export const pageManifest = [
  { id: "cover", title: "Business review", kind: "cover" },
  { id: "contents", title: "Contents", kind: "contents" },
  { id: "highlights", title: "Performance highlights", kind: "highlights" },
] as const;

type Page = (typeof pageManifest)[number];

function PageFrame({ page, index, total, children }: {
  page: Page;
  index: number;
  total: number;
  children: ReactElement;
}) {
  return (
    <main data-unslide-page={page.id}>
      <header><span>{company}</span><span>{reportingPeriod}</span></header>
      {children}
      <footer><span>{page.title}</span><span>{index + 1} / {total}</span></footer>
    </main>
  );
}

export function renderPage(page: Page, index: number, manifest: readonly Page[]): ReactElement {
  let content: ReactElement;
  if (page.kind === "cover") {
    content = <section className="hero"><p className="eyebrow">BUSINESS REPORT</p><h1>{company}</h1><p>{reportingPeriod}</p></section>;
  } else if (page.kind === "contents") {
    content = <section><p className="eyebrow">CONTENTS</p><h2>Report sequence</h2><ol>{manifest.slice(2).map((entry, offset) => <li key={entry.id}><span>{entry.title}</span><span>{offset + 3}</span></li>)}</ol></section>;
  } else {
    content = <section><p className="eyebrow">PERFORMANCE</p><h2>{page.title}</h2><div className="metrics">{highlights.map((item) => <article key={item.label}><p>{item.label}</p><strong>{item.value}</strong><small>{item.note}</small></article>)}</div></section>;
  }
  return <PageFrame key={page.id} page={page} index={index} total={manifest.length}>{content}</PageFrame>;
}
`,
    },
    {
      relativePath: `${reportName}/styles.css`,
      contents: `@page { size: 10in 5.625in; margin: 0; }
* { box-sizing: border-box; }
:root { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
body { margin: 0; color: #132820; background: #dfe7e2; font-family: Arial, sans-serif; }
[data-unslide-page] { width: 960px; height: 540px; padding: 42px 56px 34px; display: grid; grid-template-rows: auto 1fr auto; background: #fffdf7; }
header, footer { display: flex; justify-content: space-between; color: #557066; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
section { align-self: center; }
.hero h1, h2 { margin: 8px 0 18px; font: 700 48px/1.05 Georgia, serif; }
.hero p:last-child { font-size: 22px; }
.eyebrow { color: #b8492f; font-size: 13px; font-weight: 700; letter-spacing: .16em; }
ol { margin: 28px 0 0; padding: 0; list-style: none; }
li { display: flex; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid #cad5cf; font-size: 20px; }
.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.metrics article { padding-top: 18px; border-top: 3px solid #b8492f; }
.metrics p, .metrics small { display: block; color: #557066; }
.metrics strong { display: block; margin: 10px 0; font: 700 38px/1 Georgia, serif; }
@media print { body { background: white; } [data-unslide-page] { break-after: page; } [data-unslide-page]:last-child { break-after: auto; } }
`,
    },
    {
      relativePath: `${reportName}/assets/README.md`,
      contents: `# Local assets

Keep licensed report fonts and images here. Inline them with \`inlineAsset(new URL("./assets/file.ttf", import.meta.url))\` so the published HTML remains standalone.
`,
    },
    {
      relativePath: `${reportName}/tsconfig.json`,
      contents: `${JSON.stringify(
        {
          compilerOptions: {
            module: "ESNext",
            moduleResolution: "Bundler",
            target: "ES2022",
            jsx: "react-jsx",
            strict: true,
            noEmit: true,
            types: ["node", "react"],
          },
          include: [`../${reportName}.tsx`, "./**/*.ts", "./**/*.tsx"],
        },
        null,
        2,
      )}\n`,
    },
  ];
}

function starterFiles(reportName: string, starter: Starter) {
  return starter === "minimal"
    ? [
        { relativePath: `${reportName}.tsx`, contents: minimalSource(reportName) },
        { relativePath: `${reportName}.css`, contents: starterStyles },
      ]
    : businessFiles(reportName);
}

function initialConfig(reportName: string): string {
  return `${JSON.stringify(
    {
      $schema: "./node_modules/unslide/schema/unslide.schema.json",
      version: 1,
      reports: { [reportName]: { source: `${reportName}.tsx` } },
    },
    null,
    2,
  )}\n`;
}

const defaultIgnore = "artifacts/\n.tmp/\n";

function ignoresSensitiveOutputs(contents: string): boolean {
  const entries = contents.split(/\r?\n/).map((line) => line.trim());
  return ["artifacts", ".tmp"].every((root) => {
    let ignored = false;
    for (const entry of entries) {
      if (entry === "" || entry.startsWith("#")) continue;
      const negated = entry.startsWith("!");
      const rawPattern = entry.replace(/^!/, "").replace(/^\//, "");
      const pattern = rawPattern.endsWith("/")
        ? rawPattern.replace(/^\*\*\//, "").replace(/\/$/, "")
        : rawPattern.replace(/^\*\*\//, "").replace(/\/(?:\*\*|\*)$/, "");
      if (!negated && pattern === root) ignored = true;
      if (
        negated &&
        (pattern === root ||
          pattern.startsWith(`${root}/`) ||
          rawPattern === "*/" ||
          rawPattern === "**/" ||
          rawPattern === "**" ||
          rawPattern === "**/*")
      ) {
        ignored = false;
      }
    }
    return ignored;
  });
}

async function hasUnsafeParent(projectRoot: string, path: string): Promise<boolean> {
  let parent = dirname(path);
  while (parent !== projectRoot) {
    const metadata = await lstat(parent).catch((cause: unknown) => {
      if (
        cause instanceof Error &&
        "code" in cause &&
        (cause.code === "ENOENT" || cause.code === "ENOTDIR")
      ) {
        return undefined;
      }
      throw cause;
    });
    if (metadata && (metadata.isSymbolicLink() || !metadata.isDirectory())) return true;
    const next = dirname(parent);
    if (next === parent) return true;
    parent = next;
  }
  return false;
}

const planFiles = Effect.fn("init.planFiles")(function* (
  projectRoot: string,
  specifications: ReadonlyArray<{
    relativePath: string;
    contents: string;
    preserveExisting?: boolean;
  }>,
  context: CommandFailureContext,
) {
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const planned: PlannedFile[] = [];
  for (const specification of specifications) {
    const path = pathService.resolve(projectRoot, specification.relativePath);
    let state: InitFileState = "create";
    if (
      yield* Effect.tryPromise({
        try: () => hasUnsafeParent(projectRoot, path),
        catch: (cause) => commandFailure(cause, context),
      })
    ) {
      planned.push({ path, ...specification, state: "conflict" });
      continue;
    }
    const metadata = yield* Effect.promise(() =>
      lstat(path).then(
        (value) => ({ _tag: "Found" as const, value }),
        (cause) => ({ _tag: "Failed" as const, cause }),
      ),
    );
    if (metadata._tag === "Found") {
      state = specification.preserveExisting
        ? metadata.value.isFile() && !metadata.value.isSymbolicLink()
          ? "unchanged"
          : "conflict"
        : metadata.value.isFile() &&
            !metadata.value.isSymbolicLink() &&
            (yield* fs.readFileString(path)) === specification.contents
          ? "unchanged"
          : "conflict";
    } else {
      const code =
        metadata.cause instanceof Error && "code" in metadata.cause
          ? metadata.cause.code
          : undefined;
      if (code !== "ENOENT") return yield* commandFailure(metadata.cause, context);
    }
    planned.push({ path, ...specification, state });
  }
  return planned;
});

const sensitiveOutputState = Effect.fn("init.sensitiveOutputState")(function* (
  projectRoot: string,
  context: CommandFailureContext,
) {
  const ignorePath = resolve(projectRoot, ".gitignore");
  const contents = yield* Effect.tryPromise({
    try: () =>
      readFile(ignorePath, "utf8").catch((cause: unknown) => {
        if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
        throw cause;
      }),
    catch: (cause) => commandFailure(cause, { ...context, path: ignorePath }),
  });
  return contents === undefined ? false : ignoresSensitiveOutputs(contents);
});

function initSpecifications(reportName: string, starter: Starter) {
  return [
    { relativePath: "unslide.json", contents: initialConfig(reportName) },
    ...starterFiles(reportName, starter),
    { relativePath: ".gitignore", contents: defaultIgnore, preserveExisting: true },
  ];
}

export const initializeProject = Effect.fn("init.initializeProject")(function* (
  projectRoot: string,
  reportName: string,
  write: boolean,
  starter: Starter = "minimal",
) {
  const context = { command: "init", path: projectRoot, report: reportName } as const;
  const fs = yield* FileSystem.FileSystem;
  const files = yield* planFiles(
    projectRoot,
    initSpecifications(reportName, starter),
    context,
  ).pipe(Effect.mapError((cause) => commandFailure(cause, context)));
  const ignoreFile = files.find((file) => file.relativePath === ".gitignore");
  const sensitiveOutputsIgnored =
    ignoreFile?.state === "create"
      ? true
      : ignoreFile?.state === "conflict"
        ? false
        : yield* sensitiveOutputState(projectRoot, context);
  if (files.some((file) => file.state === "conflict")) {
    return {
      operation: "init" as const,
      projectRoot,
      reportName,
      starter,
      status: "conflict" as const,
      files,
      sensitiveOutputsIgnored,
    };
  }

  const creates = files.filter((file) => file.state === "create");
  if (!write) {
    return {
      operation: "init" as const,
      projectRoot,
      reportName,
      starter,
      status: creates.length > 0 ? ("planned" as const) : ("unchanged" as const),
      files,
      sensitiveOutputsIgnored,
    };
  }

  const created: PlannedFile[] = [];
  for (const file of creates) {
    const writeExit = yield* Effect.exit(
      Effect.tryPromise({
        try: () => mkdir(dirname(file.path), { recursive: true }),
        catch: (cause) => commandFailure(cause, context),
      }).pipe(Effect.flatMap(() => fs.writeFileString(file.path, file.contents, { flag: "wx" }))),
    );
    if (Exit.isFailure(writeExit)) {
      const cause = Cause.squash(writeExit.cause);
      file.state = "failed";
      for (const pending of creates) if (pending.state === "create") pending.state = "not-started";
      const partial = new InitOperationFailure({
        cause,
        files: files.map((planned) => ({
          path: planned.path,
          state: planned.state as "created" | "unchanged" | "failed" | "not-started",
        })),
        message: `Cannot finish initialization${created.length === 0 ? "" : `; these safely created files remain: ${created.map((createdFile) => createdFile.relativePath).join(", ")}`}: ${errorMessage(cause)}`,
        projectRoot,
        reportName,
        starter,
      });
      if (writeExit.cause.reasons.some((reason) => reason._tag !== "Fail")) {
        return yield* Effect.failCause(Cause.combine(writeExit.cause, Cause.fail(partial)));
      }
      return yield* partial;
    }
    file.state = "created";
    created.push(file);
  }

  return {
    operation: "init" as const,
    projectRoot,
    reportName,
    starter,
    status: creates.length > 0 ? ("created" as const) : ("unchanged" as const),
    files,
    sensitiveOutputsIgnored,
  };
});

async function rollbackCreatedFiles(paths: readonly string[], directories: readonly string[]) {
  const failures: unknown[] = [];
  for (const path of [...paths].reverse()) {
    await unlink(path).catch((cause) => failures.push(cause));
  }
  for (const directory of [...directories].reverse()) {
    await rmdir(directory).catch((cause) => failures.push(cause));
  }
  if (failures.length > 0) throw new AggregateError(failures, "Add rollback was incomplete");
}

async function writeOwnedFile(path: string, contents: string, createdFiles: string[]) {
  const handle = await open(path, "wx");
  createdFiles.push(path);
  try {
    await handle.writeFile(contents);
  } finally {
    await handle.close();
  }
}

async function conflictsWithConfiguredPath(
  filePath: string,
  candidateProject: ProjectConfig,
  reportName: string,
): Promise<boolean> {
  const canonicalFilePath = await canonicalizeThroughExistingAncestor(filePath);
  const configuredPaths = Object.values(candidateProject.reports).flatMap((report) => [
    ...(report.name === reportName ? [] : [report.sourcePath]),
    report.htmlPath,
    report.pdfPath,
    report.captureDirectory,
    report.pdfCaptureDirectory,
  ]);
  const canonicalConfiguredPaths = await Promise.all(
    configuredPaths.map((configuredPath) => canonicalizeThroughExistingAncestor(configuredPath)),
  );
  return canonicalConfiguredPaths.some((configuredPath) =>
    pathsOverlap(canonicalFilePath, configuredPath),
  );
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return !(cause instanceof Error && "code" in cause && cause.code === "ESRCH");
  }
}

function addLockConflict(lockPath: string): Error {
  return new Error(
    `Another add may be in progress (lock: ${lockPath}). If no add is running, remove the add lock files and retry.`,
  );
}

async function acquireAddLock(lockPath: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await open(lockPath, "wx");
    } catch (cause) {
      if (!(cause instanceof Error && "code" in cause && cause.code === "EEXIST")) throw cause;
      const owner = await readFile(lockPath, "utf8").catch((readCause: unknown) => {
        if (readCause instanceof Error && "code" in readCause && readCause.code === "ENOENT") {
          return undefined;
        }
        throw readCause;
      });
      if (owner === undefined) continue;
      const pid = /^\s*(\d+)\s*$/.exec(owner)?.[1];
      if (attempt === 0 && pid !== undefined && !processExists(Number(pid))) {
        const recoveryPath = `${lockPath}.recovery`;
        let recoveryLock: FileHandle | undefined;
        try {
          recoveryLock = await open(recoveryPath, "wx").catch((recoveryCause: unknown) => {
            if (
              recoveryCause instanceof Error &&
              "code" in recoveryCause &&
              recoveryCause.code === "EEXIST"
            ) {
              throw addLockConflict(lockPath);
            }
            throw recoveryCause;
          });
          const currentOwner = await readFile(lockPath, "utf8").catch((readCause: unknown) => {
            if (readCause instanceof Error && "code" in readCause && readCause.code === "ENOENT") {
              return undefined;
            }
            throw readCause;
          });
          const currentPid = /^\s*(\d+)\s*$/.exec(currentOwner ?? "")?.[1];
          if (currentPid === undefined || processExists(Number(currentPid))) {
            throw addLockConflict(lockPath);
          }
          const claimedStaleLock = `${lockPath}.stale-${process.pid}-${randomUUID()}`;
          await rename(lockPath, claimedStaleLock);
          await unlink(claimedStaleLock);
        } finally {
          await recoveryLock?.close().catch(() => undefined);
          if (recoveryLock) await unlink(recoveryPath).catch(() => undefined);
        }
        continue;
      }
      throw addLockConflict(lockPath);
    }
  }
  throw addLockConflict(lockPath);
}

function parentDirectories(projectRoot: string, filePaths: readonly string[]): string[] {
  const directories = new Set<string>();
  for (const filePath of filePaths) {
    let directory = dirname(filePath);
    while (directory !== projectRoot && relative(projectRoot, directory) !== "") {
      directories.add(directory);
      directory = dirname(directory);
    }
  }
  return [...directories].sort((a, b) => a.length - b.length);
}

export const addReport = Effect.fn("init.addReport")(function* (
  project: ProjectConfig,
  reportName: string,
  write: boolean,
  starter: Starter = "minimal",
) {
  const context = { command: "add", path: project.configPath, report: reportName } as const;
  const configMetadata = yield* Effect.tryPromise({
    try: () => lstat(project.configPath),
    catch: (cause) => commandFailure(cause, context),
  });
  if (!configMetadata.isFile() || configMetadata.isSymbolicLink()) {
    return yield* commandFailure(
      new Error("Configuration is not a regular file"),
      context,
      `Cannot add a report because ${project.configPath} is not a regular file.`,
    );
  }
  const originalConfig = yield* Effect.tryPromise({
    try: () => readFile(project.configPath, "utf8"),
    catch: (cause) => commandFailure(cause, context),
  });
  const currentProject = yield* validateProjectConfigContents(project.configPath, originalConfig);
  if (Object.hasOwn(currentProject.reports, reportName)) {
    return yield* commandFailure(
      new Error("Report is already configured"),
      context,
      `Report "${reportName}" is already configured.`,
    );
  }
  const configJson = JSON.parse(originalConfig) as {
    version: 1;
    reports: Record<string, { source: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  const nextConfig = `${JSON.stringify(
    {
      ...configJson,
      reports: { ...configJson.reports, [reportName]: { source: `${reportName}.tsx` } },
    },
    null,
    2,
  )}\n`;
  const candidateProject = yield* validateProjectConfigContents(project.configPath, nextConfig);
  const configPlan: PlannedFile = {
    path: project.configPath,
    relativePath: "unslide.json",
    contents: nextConfig,
    state: "create",
  };
  const files = yield* planFiles(
    project.projectRoot,
    [
      ...starterFiles(reportName, starter),
      { relativePath: ".gitignore", contents: defaultIgnore, preserveExisting: true },
    ],
    context,
  ).pipe(Effect.mapError((cause) => commandFailure(cause, context)));
  for (const file of files) {
    if (
      file.relativePath !== ".gitignore" &&
      file.state !== "conflict" &&
      (yield* Effect.tryPromise({
        try: () => conflictsWithConfiguredPath(file.path, candidateProject, reportName),
        catch: (cause) => commandFailure(cause, context),
      }))
    ) {
      file.state = "conflict";
    }
  }
  files.unshift(configPlan);
  const ignoreFile = files.find((file) => file.relativePath === ".gitignore");
  const sensitiveOutputsIgnored =
    ignoreFile?.state === "create"
      ? true
      : ignoreFile?.state === "conflict"
        ? false
        : yield* sensitiveOutputState(project.projectRoot, context);
  if (files.some((file) => file.state === "conflict")) {
    return {
      operation: "add" as const,
      projectRoot: project.projectRoot,
      reportName,
      starter,
      status: "conflict" as const,
      files,
      sensitiveOutputsIgnored,
    };
  }
  if (!write) {
    return {
      operation: "add" as const,
      projectRoot: project.projectRoot,
      reportName,
      starter,
      status: "planned" as const,
      files,
      sensitiveOutputsIgnored,
    };
  }

  const creates = files.filter(
    (file) => file.relativePath !== "unslide.json" && file.state === "create",
  );
  const directories = parentDirectories(
    project.projectRoot,
    creates.map((file) => file.path),
  );
  const createdDirectories: string[] = [];
  const createdFiles: string[] = [];
  const temporaryConfig = resolve(
    project.projectRoot,
    `.unslide.json.add-${process.pid}-${randomUUID()}.tmp`,
  );
  const lockPath = resolve(project.projectRoot, ".unslide.json.add.lock");
  yield* Effect.tryPromise({
    try: async () => {
      let lockCreated = false;
      try {
        const lock = await acquireAddLock(lockPath);
        lockCreated = true;
        try {
          await lock.writeFile(`${process.pid}\n`);
        } finally {
          await lock.close();
        }
        if ((await readFile(project.configPath, "utf8")) !== originalConfig) {
          throw new Error("unslide.json changed after the add plan was prepared");
        }
        for (const directory of directories) {
          try {
            await mkdir(directory);
            createdDirectories.push(directory);
          } catch (cause) {
            if (!(cause instanceof Error && "code" in cause && cause.code === "EEXIST"))
              throw cause;
            const metadata = await lstat(directory);
            if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
              throw new Error(`Cannot add through unsafe parent path: ${directory}`);
            }
          }
        }
        for (const file of creates) {
          await writeOwnedFile(file.path, file.contents, createdFiles);
          file.state = "created";
        }
        await writeFile(temporaryConfig, nextConfig, { flag: "wx" });
        if ((await readFile(project.configPath, "utf8")) !== originalConfig) {
          throw new Error("unslide.json changed after the add plan was prepared");
        }
        await rename(temporaryConfig, project.configPath);
        configPlan.state = "created";
      } catch (cause) {
        const cleanupFailures: unknown[] = [];
        await unlink(temporaryConfig).catch((cleanupCause) => {
          if (
            !(
              cleanupCause instanceof Error &&
              "code" in cleanupCause &&
              cleanupCause.code === "ENOENT"
            )
          ) {
            cleanupFailures.push(cleanupCause);
          }
        });
        await rollbackCreatedFiles(createdFiles, createdDirectories).catch((cleanupCause) =>
          cleanupFailures.push(cleanupCause),
        );
        if (lockCreated) {
          await unlink(lockPath).catch((cleanupCause) => cleanupFailures.push(cleanupCause));
          lockCreated = false;
        }
        if (cleanupFailures.length > 0) {
          throw new AggregateError(
            [cause, ...cleanupFailures],
            "Add failed and rollback was incomplete",
          );
        }
        throw cause;
      } finally {
        if (lockCreated) await unlink(lockPath).catch(() => undefined);
      }
    },
    catch: (cause) => {
      const rollbackIncomplete = cause instanceof AggregateError;
      return commandFailure(
        cause,
        context,
        rollbackIncomplete
          ? `Cannot add report "${reportName}"; rollback was incomplete and manual cleanup may be required: ${errorMessage(cause)}`
          : `Cannot add report "${reportName}" without leaving the project unchanged: ${errorMessage(cause)}`,
      );
    },
  });

  return {
    operation: "add" as const,
    projectRoot: project.projectRoot,
    reportName,
    starter,
    status: "created" as const,
    files,
    sensitiveOutputsIgnored,
  };
});
