import { createHash } from "node:crypto";
import { Effect, FileSystem, Path } from "effect";
import { publishFileAtomically } from "./file-publication.js";
import { errorMessage, mapCommandFailure } from "./failures.js";
import type { ReviewManifest } from "./results.js";

/** Publishes one complete manifest by same-directory staging and rename. */
export const publishReviewManifest = Effect.fn("reviewManifest.publishReviewManifest")(function* (
  output: string,
  manifest: ReviewManifest,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const outputPath = path.resolve(output);
  const bytes = Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8");
  const evidence = {
    path: outputPath,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const context = { command: "review", path: outputPath } as const;
  yield* mapCommandFailure(
    publishFileAtomically(outputPath, (stagingPath) =>
      fs.writeFile(stagingPath, bytes, { flag: "wx" }),
    ),
    context,
    (cause) => `Cannot publish review manifest ${outputPath}: ${errorMessage(cause)}`,
  );
  return evidence;
});
