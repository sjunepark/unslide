import { captureHtmlPages } from "../src/unslide/capture.js";

const [, , inputArgument, outputArgument] = process.argv;

if (!inputArgument || !outputArgument) {
  console.error("Usage: tsx scripts/capture.ts <report.html> <output-directory>");
  process.exit(1);
}

try {
  const result = await captureHtmlPages(inputArgument, outputArgument);
  console.log(`Captured ${result.pages.length} pages to ${result.outputDirectory}`);
} catch (error) {
  console.error(`Capture failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
