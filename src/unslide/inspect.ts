import { Effect, Path } from "effect";
import { withLoadedArtifact } from "./browser.js";
import { mapCommandFailure } from "./failures.js";
import type { ArtifactPage } from "./protocol.js";

export interface InspectionResult {
  inputPath: string;
  pages: ArtifactPage[];
}

export const inspectHtmlArtifact = Effect.fn("inspect.inspectHtmlArtifact")(function* (input: string) {
  const path = yield* Path.Path;
  const inputPath = path.resolve(input);
  const pages = yield* mapCommandFailure(
    withLoadedArtifact(inputPath, async (session) => session.pages),
    { command: "inspect", path: inputPath },
  );
  return { inputPath, pages };
});
