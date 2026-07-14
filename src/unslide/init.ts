import { lstat } from "node:fs/promises";
import { Cause, Effect, Exit, FileSystem, Path } from "effect";
import { commandFailure, errorMessage, type CommandFailureContext } from "./failures.js";

export type InitFileState = "create" | "created" | "unchanged" | "conflict";

export interface InitFile {
  path: string;
  relativePath: string;
  state: InitFileState;
}

export interface InitResult {
  projectRoot: string;
  reportName: string;
  status: "planned" | "created" | "unchanged" | "conflict";
  files: InitFile[];
}

interface PlannedFile extends InitFile {
  contents: string;
}

function reportSource(reportName: string): string {
  return `import { fileURLToPath } from "node:url";
import React, { readTextAsset } from "unslide/react";

// Optional starter styling: remove this read, the <style> element, and the CSS file to start unstyled.
const styles = await readTextAsset(fileURLToPath(new URL("./${reportName}.css", import.meta.url)));

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

const starterStyles = `/* Optional starter styling. Delete this file and its <style> element to start unstyled. */
@page { size: 10in 5.625in; margin: 0; }

* { box-sizing: border-box; }
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

function scaffoldFiles(projectRoot: string, reportName: string): Array<{ relativePath: string; contents: string }> {
  return [
    {
      relativePath: "unslide.json",
      contents: `${JSON.stringify({
        $schema: "./node_modules/unslide/schema/unslide.schema.json",
        version: 1,
        reports: {
          [reportName]: {
            source: `${reportName}.tsx`,
            html: `artifacts/${reportName}.html`,
            pdf: `artifacts/${reportName}.pdf`,
            captures: `.tmp/captures/${reportName}`,
            pdfCaptures: `.tmp/pdf-captures/${reportName}`,
          },
        },
      }, null, 2)}\n`,
    },
    { relativePath: `${reportName}.tsx`, contents: reportSource(reportName) },
    { relativePath: `${reportName}.css`, contents: starterStyles },
  ];
}

const planFiles = Effect.fn("init.planFiles")(function* (
  projectRoot: string,
  reportName: string,
  context: CommandFailureContext,
) {
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const planned: PlannedFile[] = [];
  for (const { relativePath, contents } of scaffoldFiles(projectRoot, reportName)) {
    const path = pathService.resolve(projectRoot, relativePath);
    let state: InitFileState = "create";
    const metadata = yield* Effect.promise(() => lstat(path).then(
      (value) => ({ _tag: "Found" as const, value }),
      (cause) => ({ _tag: "Failed" as const, cause }),
    ));
    if (metadata._tag === "Found") {
      state = metadata.value.isFile()
        && !metadata.value.isSymbolicLink()
        && (yield* fs.readFileString(path)) === contents
        ? "unchanged"
        : "conflict";
    } else {
      const code = metadata.cause instanceof Error && "code" in metadata.cause
        ? metadata.cause.code
        : undefined;
      if (code !== "ENOENT") return yield* commandFailure(metadata.cause, context);
    }
    planned.push({ path, relativePath, contents, state });
  }
  return planned;
});

export const initializeProject = Effect.fn("init.initializeProject")(function* (
  projectRoot: string,
  reportName: string,
  write: boolean,
) {
  const context = { command: "init", path: projectRoot, report: reportName } as const;
  const fs = yield* FileSystem.FileSystem;
  const files = yield* planFiles(projectRoot, reportName, context).pipe(
    Effect.mapError((cause) => commandFailure(cause, context)),
  );
  if (files.some((file) => file.state === "conflict")) {
    return { projectRoot, reportName, status: "conflict", files };
  }

  const creates = files.filter((file) => file.state === "create");
  if (!write) {
    return {
      projectRoot,
      reportName,
      status: creates.length > 0 ? "planned" : "unchanged",
      files,
    };
  }

  const created: PlannedFile[] = [];
  for (const file of creates) {
    const writeExit = yield* Effect.exit(fs.writeFileString(file.path, file.contents, { flag: "wx" }));
    if (Exit.isFailure(writeExit)) {
      const cause = Cause.squash(writeExit.cause);
      const message = `Cannot finish initialization${created.length === 0 ? "" : `; these safely created files remain: ${created.map((createdFile) => createdFile.relativePath).join(", ")}`}: ${errorMessage(cause)}`;
      if (writeExit.cause.reasons.some((reason) => reason._tag !== "Fail")) {
        return yield* Effect.failCause(created.length === 0
          ? writeExit.cause
          : Cause.combine(
            writeExit.cause,
            Cause.fail(commandFailure(writeExit.cause, context, message)),
          ));
      }
      return yield* commandFailure(
        writeExit.cause,
        context,
        message,
      );
    }
    file.state = "created";
    created.push(file);
  }

  return {
    projectRoot,
    reportName,
    status: creates.length > 0 ? "created" : "unchanged",
    files,
  };
});
