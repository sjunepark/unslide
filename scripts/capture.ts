import { mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import { chromium } from "playwright";

const [, , inputArgument, outputArgument] = process.argv;

if (!inputArgument || !outputArgument) {
  console.error("Usage: tsx scripts/capture.ts <report.html> <output-directory>");
  process.exit(1);
}

const inputPath = resolve(inputArgument);
const outputDirectory = resolve(outputArgument);

await mkdir(outputDirectory, { recursive: true });
const existingCaptures = (await readdir(outputDirectory)).filter((name) =>
  /^page-\d+\.png$/.test(name),
);
await Promise.all(
  existingCaptures.map((name) => rm(resolve(outputDirectory, name), { force: true })),
);

let browser: Browser | undefined;

try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(pathToFileURL(inputPath).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const pages = page.locator("[data-page]");
  const pageCount = await pages.count();

  if (pageCount === 0) {
    throw new Error("No report pages found. Expected elements with a data-page attribute.");
  }

  for (let index = 0; index < pageCount; index += 1) {
    const outputPath = resolve(outputDirectory, `page-${String(index + 1).padStart(2, "0")}.png`);
    await pages.nth(index).screenshot({ path: outputPath, animations: "disabled" });
  }

  await context.close();
  console.log(`Captured ${pageCount} pages to ${outputDirectory}`);
} catch (error) {
  console.error(`Capture failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
