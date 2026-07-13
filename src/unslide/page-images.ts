import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { Cause, Effect, Exit, FileSystem, Path } from "effect";
import { commandFailure, errorMessage, mapCommandFailure, type CommandFailure } from "./failures.js";
import { scoped } from "./lifecycle.js";

export interface PageImageOutput {
  outputPath: string;
}

/**
 * Generates a complete page-image set in isolation, then replaces only the
 * managed page PNGs while preserving unrelated output and prior files on error.
 */
export function replacePageImages<T extends PageImageOutput>(
  output: string,
  kind: "captures" | "images",
  generate: (stagingDirectory: string) => Effect.Effect<T[], CommandFailure, FileSystem.FileSystem | Path.Path>,
): Effect.Effect<T[], CommandFailure, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const outputDirectory = path.resolve(output);
    const stagingDirectory = path.resolve(outputDirectory, `.unslide-page-images-${randomUUID()}`);
    const backupDirectory = path.resolve(stagingDirectory, "previous");
    const context = {
      command: kind === "captures" ? "capture" : "inspect-pdf",
      path: outputDirectory,
    } as const;

    return yield* mapCommandFailure(scoped(Effect.gen(function* () {
      const staging = yield* Effect.acquireRelease(
        fs.makeDirectory(stagingDirectory, { recursive: true }).pipe(
          Effect.as({ preserve: false }),
        ),
        (state) => state.preserve
          ? Effect.void
          : fs.remove(stagingDirectory, { recursive: true, force: true }).pipe(Effect.orDie),
      );
      const generated = yield* generate(stagingDirectory);
      // Dirent identity is intentional: the portable service exposes names and
      // stat follows symlinks, which would weaken the managed-file boundary.
      const previousNames = yield* Effect.tryPromise({
        try: () => readdir(outputDirectory, { withFileTypes: true }).then((entries) => entries
          .filter((entry) => entry.isFile() && /^page-\d+\.png$/.test(entry.name))
          .map((entry) => entry.name)),
        catch: (cause) => commandFailure(cause, context),
      });
      yield* fs.makeDirectory(backupDirectory);
      const backedUpNames: string[] = [];
      const published: string[] = [];

      const publication = Effect.gen(function* () {
        for (const name of previousNames) {
          yield* fs.rename(path.resolve(outputDirectory, name), path.resolve(backupDirectory, name));
          backedUpNames.push(name);
        }
        for (const page of generated) {
          const fileName = path.basename(page.outputPath);
          if (!/^page-\d+\.png$/.test(fileName) || path.resolve(outputDirectory, fileName) !== path.resolve(page.outputPath)) {
            return yield* commandFailure(
              new Error("Invalid managed page-image output path"),
              context,
              `Invalid managed page-image output path: ${page.outputPath}`,
            );
          }
          yield* fs.rename(path.resolve(stagingDirectory, fileName), page.outputPath);
          published.push(fileName);
        }
      });

      const publicationExit = yield* Effect.exit(publication);
      if (Exit.isFailure(publicationExit)) {
        const rollbackErrors: string[] = [];
        for (const name of published) {
          const rollback = yield* Effect.exit(fs.remove(path.resolve(outputDirectory, name), { force: true }));
          if (Exit.isFailure(rollback)) rollbackErrors.push(errorMessage(Cause.squash(rollback.cause)));
        }
        for (const name of backedUpNames) {
          const rollback = yield* Effect.exit(
            fs.rename(path.resolve(backupDirectory, name), path.resolve(outputDirectory, name)),
          );
          if (Exit.isFailure(rollback)) rollbackErrors.push(errorMessage(Cause.squash(rollback.cause)));
        }

        staging.preserve = rollbackErrors.length > 0;
        const pageKind = kind === "captures" ? "page captures" : "page images";
        const primaryMessage = errorMessage(Cause.squash(publicationExit.cause));
        const publicationMessage = `Cannot publish ${pageKind}${rollbackErrors.length === 0 ? `; previous ${kind} were restored` : ` and rollback was incomplete (recovery files remain in ${stagingDirectory}): ${rollbackErrors.join("; ")}`}: ${primaryMessage}`;
        if (publicationExit.cause.reasons.some((reason) => reason._tag !== "Fail")) {
          return yield* Effect.failCause(rollbackErrors.length === 0
            ? publicationExit.cause
            : Cause.combine(
              publicationExit.cause,
              Cause.fail(commandFailure(publicationExit.cause, context, publicationMessage)),
            ));
        }
        return yield* commandFailure(publicationExit.cause, context, publicationMessage);
      }

      // Superseded managed images remain only in staging. Unrelated files never
      // move and survive cleanup.
      return generated;
    })), context);
  });
}
