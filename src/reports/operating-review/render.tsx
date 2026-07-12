import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeReportHtml } from "../../unslide/render.js";
import { operatingReviewData } from "./data.js";
import { OperatingReview } from "./report.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const styles = await readFile(resolve(sourceDirectory, "styles.css"), "utf8");

await writeReportHtml({
  title: `${operatingReviewData.company} — ${operatingReviewData.period} Operating Review`,
  body: <OperatingReview data={operatingReviewData} />,
  reportStyles: styles,
  outputPath: "artifacts/operating-review/report.html",
});
