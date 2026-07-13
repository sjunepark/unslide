import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { PAGE_MARKER_SELECTOR } from "./protocol.js";
import { withLoadedArtifact } from "./browser.js";

export interface CapturedPage {
  id: string;
  index: number;
  width: number;
  height: number;
  outputPath: string;
}

export interface CaptureResult {
  inputPath: string;
  outputDirectory: string;
  pages: CapturedPage[];
}

export async function captureHtmlPages(input: string, output: string): Promise<CaptureResult> {
  const inputPath = resolve(input);
  const outputDirectory = resolve(output);
  const stagingDirectory = resolve(outputDirectory, `.unslide-capture-${randomUUID()}`);
  const backupDirectory = resolve(stagingDirectory, "previous");
  let preserveStaging = false;

  await mkdir(stagingDirectory, { recursive: true });
  try {
    const stagedPages = await withLoadedArtifact(inputPath, async ({ page, pages }) => {
      const digits = Math.max(2, String(pages.length).length);
      const pageElements = page.locator(PAGE_MARKER_SELECTOR);

      const captures: CapturedPage[] = [];
      for (const [index, metadata] of pages.entries()) {
        const element = pageElements.nth(index);
        const bounds = await element.boundingBox();
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
          throw new Error(`Page "${metadata.id}" at position ${index + 1} has no visible capture area.`);
        }

        const fileName = `page-${String(index + 1).padStart(digits, "0")}.png`;
        const stagedPath = resolve(stagingDirectory, fileName);
        await element.screenshot({ path: stagedPath, animations: "disabled" });
        captures.push({
          id: metadata.id,
          index,
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
          outputPath: resolve(outputDirectory, fileName),
        });
      }
      return captures;
    });

    const previousNames = (await readdir(outputDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^page-\d+\.png$/.test(entry.name))
      .map((entry) => entry.name);
    await mkdir(backupDirectory);
    const backedUpNames: string[] = [];
    const published: string[] = [];

    try {
      for (const name of previousNames) {
        await rename(resolve(outputDirectory, name), resolve(backupDirectory, name));
        backedUpNames.push(name);
      }
      for (const { outputPath } of stagedPages) {
        const fileName = basename(outputPath);
        await rename(resolve(stagingDirectory, fileName), outputPath);
        published.push(fileName);
      }
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const name of published) {
        try {
          await rm(resolve(outputDirectory, name), { force: true });
        } catch (rollbackError) {
          rollbackErrors.push(String(rollbackError));
        }
      }
      for (const name of backedUpNames) {
        try {
          await rename(resolve(backupDirectory, name), resolve(outputDirectory, name));
        } catch (rollbackError) {
          rollbackErrors.push(String(rollbackError));
        }
      }
      preserveStaging = rollbackErrors.length > 0;
      throw new Error(
        `Cannot publish page captures${rollbackErrors.length === 0 ? "; previous captures were restored" : ` and rollback was incomplete (recovery files remain in ${stagingDirectory}): ${rollbackErrors.join("; ")}`}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Previous page captures not present in this run remain only in staging and
    // are removed with it; unrelated output files never move.
    return { inputPath, outputDirectory, pages: stagedPages };
  } finally {
    if (!preserveStaging) await rm(stagingDirectory, { recursive: true, force: true });
  }
}
