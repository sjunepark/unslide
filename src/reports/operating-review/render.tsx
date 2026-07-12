import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { operatingReviewData } from "./data.js";
import { OperatingReview } from "./report.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve("artifacts/operating-review/report.html");
const styles = await readFile(resolve(sourceDirectory, "styles.css"), "utf8");
const body = renderToStaticMarkup(<OperatingReview data={operatingReviewData} />);
const title = renderToStaticMarkup(<>{operatingReviewData.company} — {operatingReviewData.period} Operating Review</>);
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>${styles}</style>
  </head>
  <body>${body}</body>
</html>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html);
console.log(`Rendered 8 pages to ${outputPath}`);
