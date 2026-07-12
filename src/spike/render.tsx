import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { spikeReportData } from "./data.js";
import { SpikeReport } from "./report.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve("artifacts/spike/report.html");
const styles = await readFile(resolve(sourceDirectory, "styles.css"), "utf8");
const report = renderToStaticMarkup(<SpikeReport data={spikeReportData} />);
const title = renderToStaticMarkup(<>{spikeReportData.company} — {spikeReportData.period}</>);
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>${styles}</style>
  </head>
  <body>${report}</body>
</html>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html);
console.log(`Rendered 3 pages to ${outputPath}`);
