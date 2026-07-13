import { lstat, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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
            captures: `.tmp/captures/${reportName}`,
          },
        },
      }, null, 2)}\n`,
    },
    { relativePath: `${reportName}.tsx`, contents: reportSource(reportName) },
    { relativePath: `${reportName}.css`, contents: starterStyles },
  ];
}

async function planFiles(projectRoot: string, reportName: string): Promise<PlannedFile[]> {
  return Promise.all(scaffoldFiles(projectRoot, reportName).map(async ({ relativePath, contents }) => {
    const path = resolve(projectRoot, relativePath);
    let state: InitFileState = "create";
    try {
      const metadata = await lstat(path);
      state = metadata.isFile() && !metadata.isSymbolicLink() && await readFile(path, "utf8") === contents
        ? "unchanged"
        : "conflict";
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "ENOENT") throw error;
    }
    return { path, relativePath, contents, state };
  }));
}

export async function initializeProject(projectRoot: string, reportName: string, write: boolean): Promise<InitResult> {
  const files = await planFiles(projectRoot, reportName);
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
  try {
    for (const file of creates) {
      await writeFile(file.path, file.contents, { flag: "wx" });
      file.state = "created";
      created.push(file);
    }
  } catch (error) {
    throw new Error(
      `Cannot finish initialization${created.length === 0 ? "" : `; these safely created files remain: ${created.map((file) => file.relativePath).join(", ")}`}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    projectRoot,
    reportName,
    status: creates.length > 0 ? "created" : "unchanged",
    files,
  };
}
