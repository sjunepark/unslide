import { randomUUID } from "node:crypto";
import { Cause, Effect, Exit, FileSystem, Path } from "effect";
import { scoped } from "./lifecycle.js";

/**
 * Writes a same-directory staging file and atomically replaces the destination.
 * If the publishing fiber fails or is interrupted after the rename commits,
 * the previous destination bytes are restored before the failure escapes.
 */
export function publishFileAtomically<A, E, R>(
  output: string,
  write: (stagingPath: string) => Effect.Effect<A, E, R>,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const outputPath = path.resolve(output);
    const stagingPath = path.resolve(
      path.dirname(outputPath),
      `.${path.basename(outputPath)}.tmp-${process.pid}-${randomUUID()}`,
    );
    const backupPath = `${stagingPath}.previous`;

    return yield* scoped(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          yield* restore(fs.makeDirectory(path.dirname(outputPath), { recursive: true }));
          const publication = yield* Effect.acquireRelease(
            Effect.succeed({ previousCopied: false, published: false }),
            (state, exit) =>
              Effect.gen(function* () {
                const rollback = Effect.gen(function* () {
                  if (!state.published) return;
                  if (state.previousCopied) {
                    yield* fs.rename(backupPath, outputPath);
                    state.previousCopied = false;
                  } else {
                    yield* fs.remove(outputPath, { force: true });
                  }
                  state.published = false;
                });
                const cleanup = Effect.gen(function* () {
                  // Keep the backup until every other cleanup step succeeds so a
                  // cleanup failure can still restore the prior destination.
                  yield* fs.remove(stagingPath, { force: true });
                  yield* fs.remove(backupPath, { force: true });
                  state.previousCopied = false;
                });

                if (Exit.isFailure(exit)) {
                  yield* rollback;
                  yield* cleanup;
                  return;
                }

                const cleanupExit = yield* Effect.exit(cleanup);
                if (Exit.isSuccess(cleanupExit)) return;
                const rollbackExit = yield* Effect.exit(rollback);
                return yield* Effect.failCause(
                  Exit.isFailure(rollbackExit)
                    ? Cause.combine(cleanupExit.cause, rollbackExit.cause)
                    : cleanupExit.cause,
                );
              }).pipe(Effect.orDie),
          );

          const value = yield* restore(write(stagingPath));
          if (yield* restore(fs.exists(outputPath))) {
            const outputInfo = yield* restore(fs.stat(outputPath));
            if (outputInfo.type === "File") {
              yield* restore(fs.copyFile(outputPath, backupPath));
              publication.previousCopied = true;
            }
          }
          yield* fs.rename(stagingPath, outputPath);
          publication.published = true;
          return { outputPath, value };
        }),
      ),
    );
  });
}
