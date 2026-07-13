import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTextAsset } from "../unslide/render.js";
import { spikeReportData } from "./data.js";
import { SpikeReport } from "./report.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const styles = await readTextAsset(resolve(sourceDirectory, "styles.css"));

export default (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{`${spikeReportData.company} — ${spikeReportData.period}`}</title>
      <style>{styles}</style>
    </head>
    <body><SpikeReport data={spikeReportData} /></body>
  </html>
);
