import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTextAsset } from "unslide/react";
import { operatingReviewData } from "./data.js";
import { OperatingReview } from "./report.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const styles = await readTextAsset(resolve(sourceDirectory, "styles.css"));

export default (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{`${operatingReviewData.company} — ${operatingReviewData.period} Operating Review`}</title>
      <style>{styles}</style>
    </head>
    <body><OperatingReview data={operatingReviewData} /></body>
  </html>
);
