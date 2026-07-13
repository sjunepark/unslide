import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

export interface PageImageOutput {
  outputPath: string;
}

/**
 * Generates a complete page-image set in isolation, then replaces only the
 * managed page PNGs while preserving unrelated output and prior files on error.
 */
export async function replacePageImages<T extends PageImageOutput>(
  output: string,
  kind: "captures" | "images",
  generate: (stagingDirectory: string) => Promise<T[]>,
): Promise<T[]> {
  const outputDirectory = resolve(output);
  const stagingDirectory = resolve(outputDirectory, `.unslide-page-images-${randomUUID()}`);
  const backupDirectory = resolve(stagingDirectory, "previous");
  let preserveStaging = false;

  await mkdir(stagingDirectory, { recursive: true });
  try {
    const generated = await generate(stagingDirectory);
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
      for (const page of generated) {
        const fileName = basename(page.outputPath);
        if (!/^page-\d+\.png$/.test(fileName) || resolve(outputDirectory, fileName) !== resolve(page.outputPath)) {
          throw new Error(`Invalid managed page-image output path: ${page.outputPath}`);
        }
        await rename(resolve(stagingDirectory, fileName), page.outputPath);
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
      const pageKind = kind === "captures" ? "page captures" : "page images";
      throw new Error(
        `Cannot publish ${pageKind}${rollbackErrors.length === 0 ? `; previous ${kind} were restored` : ` and rollback was incomplete (recovery files remain in ${stagingDirectory}): ${rollbackErrors.join("; ")}`}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Superseded managed images remain only in staging. Unrelated files never
    // move and survive cleanup.
    return generated;
  } finally {
    if (!preserveStaging) await rm(stagingDirectory, { recursive: true, force: true });
  }
}
