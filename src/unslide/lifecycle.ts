import { Cause, Effect, Exit, Scope } from "effect";

export interface LifecycleRunOptions {
  readonly signal?: AbortSignal;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function causeMessage(cause: Cause.Cause<unknown>): string {
  return cause.reasons.map((reason) => {
    switch (reason._tag) {
      case "Fail":
        return errorMessage(reason.error);
      case "Die":
        return `Cleanup failed: ${errorMessage(reason.defect)}`;
      case "Interrupt":
        return "Operation interrupted.";
    }
  }).join("\n");
}

/**
 * Runs a real resource scope while retaining both the operation and cleanup
 * causes. Effect's ordinary scoped Promise runner reports only the finalizer
 * defect when both fail, which would hide the actionable primary failure.
 */
export function runScoped<A, E>(
  effect: Effect.Effect<A, E, Scope.Scope>,
  options: LifecycleRunOptions = {},
): Promise<A> {
  const program = Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const primary = yield* Effect.exit(restore(Scope.provide(scope)(effect)));
      const cleanup = yield* Effect.exit(Scope.close(scope, primary));

      if (Exit.isFailure(cleanup)) {
        const cause = Exit.isFailure(primary)
          ? Cause.combine(primary.cause, cleanup.cause)
          : cleanup.cause;
        return yield* Effect.failCause(cause);
      }
      return yield* primary;
    }),
  );

  return Effect.runPromiseExit(program, options).then((exit) => {
    if (Exit.isSuccess(exit)) return exit.value;
    throw new Error(causeMessage(exit.cause), { cause: Cause.squash(exit.cause) });
  });
}
