import { Cause, Data, Effect, Exit, Scope } from "effect";
import { errorMessage } from "./failures.js";

export function onceAsync<A>(operation: () => PromiseLike<A>): () => Promise<A> {
  let result: Promise<A> | undefined;
  return () => result ??= Promise.resolve().then(operation);
}

export function causeMessage(cause: Cause.Cause<unknown>): string {
  return cause.reasons.map((reason) => {
    switch (reason._tag) {
      case "Fail":
        return errorMessage(reason.error);
      case "Die":
        return errorMessage(reason.defect);
      case "Interrupt":
        return "Operation interrupted.";
    }
  }).join("\n");
}

export class ResourceCleanupFailure extends Data.TaggedError("ResourceCleanupFailure")<{
  readonly cause: Cause.Cause<never>;
  readonly message: string;
}> {}

function cleanupFailure(cause: Cause.Cause<never>): ResourceCleanupFailure {
  return new ResourceCleanupFailure({
    cause,
    message: `Cleanup failed: ${causeMessage(cause)}`,
  });
}

/**
 * Runs a real resource scope while retaining both the operation and cleanup
 * causes. Effect's ordinary scoped Promise runner reports only the finalizer
 * defect when both fail, which would hide the actionable primary failure.
 */
export function scoped<A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | ResourceCleanupFailure, Exclude<R, Scope.Scope>> {
  return Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const primary = yield* Effect.exit(restore(Scope.provide(scope)(effect)));
      const cleanup = yield* Effect.exit(Scope.close(scope, primary));

      if (Exit.isFailure(cleanup)) {
        const cleanupCause = Cause.fail(cleanupFailure(cleanup.cause));
        const cause = Exit.isFailure(primary)
          ? Cause.combine(primary.cause, cleanupCause)
          : cleanupCause;
        return yield* Effect.failCause(cause);
      }
      return yield* primary;
    }),
  );
}
