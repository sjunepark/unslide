import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeReportHtml } from "../unslide/render.js";
import { spikeReportData } from "./data.js";
import { SpikeReport } from "./report.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const styles = await readFile(resolve(sourceDirectory, "styles.css"), "utf8");

await writeReportHtml({
  title: `${spikeReportData.company} — ${spikeReportData.period}`,
  body: <SpikeReport data={spikeReportData} />,
  reportStyles: styles,
  outputPath: "artifacts/spike/report.html",
});
