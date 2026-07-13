import { isValidElement } from "react";
import { tsImport } from "tsx/esm/api";
import type { ReportConfig } from "./config.js";
import { writeReportHtml } from "./render.js";

export interface BuildResult {
  name: string;
  htmlPath: string;
}

export async function buildReport(report: ReportConfig): Promise<BuildResult> {
  let entryModule: Record<string, unknown>;
  try {
    entryModule = await tsImport(report.sourcePath, import.meta.url) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Cannot load source for report "${report.name}": ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isValidElement(entryModule.default)) {
    throw new Error(`Report "${report.name}" source must export one complete React document as its default export.`);
  }

  await writeReportHtml({ document: entryModule.default, outputPath: report.htmlPath });
  return { name: report.name, htmlPath: report.htmlPath };
}
