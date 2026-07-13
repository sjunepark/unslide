import { resolve } from "node:path";
import { withLoadedArtifact } from "./browser.js";
import type { ArtifactPage } from "./protocol.js";

export interface InspectionResult {
  inputPath: string;
  pages: ArtifactPage[];
}

export async function inspectHtmlArtifact(input: string): Promise<InspectionResult> {
  const inputPath = resolve(input);
  const pages = await withLoadedArtifact(inputPath, async (session) => session.pages);
  return { inputPath, pages };
}
