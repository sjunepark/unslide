import { Effect, Path } from "effect";
import { commandFailure } from "./failures.js";
import { canonicalizeThroughExistingAncestor, pathsOverlap } from "./paths.js";

/** Rejects canonical input/output overlap before an artifact operation starts. */
export const validateArtifactOutputPaths = Effect.fn("artifactPaths.validateArtifactOutputPaths")(
  function* (command: "capture" | "export" | "inspect-pdf", input: string, output: string) {
    const path = yield* Path.Path;
    const inputPath = path.resolve(input);
    const outputPath = path.resolve(output);
    const [canonicalInput, canonicalOutput] = yield* Effect.tryPromise({
      try: () =>
        Promise.all([
          canonicalizeThroughExistingAncestor(inputPath),
          canonicalizeThroughExistingAncestor(outputPath),
        ]),
      catch: (cause) => commandFailure(cause, { command, path: inputPath }),
    });
    if (pathsOverlap(canonicalInput, canonicalOutput)) {
      return yield* commandFailure(
        new Error("Artifact input and output overlap"),
        { command, path: inputPath },
        `Artifact input ${inputPath} overlaps output ${outputPath} after resolving symlinks.`,
      );
    }
    return { inputPath, outputPath };
  },
);
