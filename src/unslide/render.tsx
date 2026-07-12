import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

interface WriteReportOptions {
  title: string;
  body: ReactNode;
  reportStyles: string;
  outputPath: string;
}

const foundationPath = resolve(dirname(fileURLToPath(import.meta.url)), "foundation.css");

export async function writeReportHtml({
  title,
  body,
  reportStyles,
  outputPath,
}: WriteReportOptions) {
  const foundationStyles = await readFile(foundationPath, "utf8");
  const markup = renderToStaticMarkup(body);
  const escapedTitle = renderToStaticMarkup(<>{title}</>);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapedTitle}</title>
    <style>${foundationStyles}\n${reportStyles}</style>
  </head>
  <body>${markup}</body>
</html>
`;

  const resolvedOutputPath = resolve(outputPath);
  await mkdir(dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, html);
  console.log(`Rendered report to ${resolvedOutputPath}`);
}
