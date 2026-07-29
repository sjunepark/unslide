import { Effect, Path } from "effect";
import { commandFailure } from "./failures.js";
import { canonicalizeThroughExistingAncestor, pathsOverlap } from "./paths.js";

/** Rejects canonical input/output overlap before an artifact operation starts. */
export const validateArtifactOutputPaths = Effect.fn("artifactPaths.validateArtifactOutputPaths")(
  function* (command: "capture" | "export" | "inspect-pdf", input: string, output: string) {
    const path = yield* Path.Path;
    const inputPath = path.resolve(input);
    const outputPath = path.resolve(output);
    const canonicalInput = yield* Effect.tryPromise({
      try: () => canonicalizeThroughExistingAncestor(inputPath),
      catch: (cause) => commandFailure(cause, { command, path: inputPath }),
    });
    const canonicalOutput = yield* Effect.tryPromise({
      try: () => canonicalizeThroughExistingAncestor(outputPath),
      catch: (cause) => commandFailure(cause, { command, path: outputPath }),
    });
    if (pathsOverlap(canonicalInput, canonicalOutput)) {
      return yield* commandFailure(
        new Error("Artifact input and output overlap"),
        { command, code: "usage", path: inputPath },
        `Artifact input ${inputPath} overlaps output ${outputPath} after resolving symlinks.`,
      );
    }
    return { inputPath, outputPath };
  },
);
