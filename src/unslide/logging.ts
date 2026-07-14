import { Context, Effect, Exit, Logger, References } from "effect";

export type CliLogLevel = "off" | "info" | "debug";

export interface LogAnnotations {
  readonly [key: string]: unknown;
}

const stderrJsonLogger = Logger.withConsoleError(Logger.formatJson);
const LoggingEnabled = Context.Reference<boolean>("unslide/LoggingEnabled", {
  defaultValue: () => false,
});

/** Replaces Effect's default console logger so stdout remains protocol-only. */
export function provideCliLogging<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  level: CliLogLevel,
): Effect.Effect<A, E, R> {
  const minimumLevel = level === "debug" ? "Debug" : level === "info" ? "Info" : "None";
  const loggerLayer = Logger.layer(level === "off" ? [] : [stderrJsonLogger]);
  return effect.pipe(
    Effect.provideService(LoggingEnabled, level !== "off"),
    Effect.provideService(References.MinimumLogLevel, minimumLevel),
    Effect.provide(loggerLayer),
  );
}

/** Emits consistent phase boundaries while leaving the effect's result unchanged. */
export function withLogPhase<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  phase: string,
  annotations: LogAnnotations = {},
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    if (!(yield* LoggingEnabled)) return yield* effect;
    yield* Effect.logInfo("phase.started");
    return yield* effect.pipe(Effect.onExit((exit) =>
      Exit.isSuccess(exit)
        ? Effect.logInfo("phase.completed")
        : Effect.logError("phase.failed"),
    ));
  }).pipe(
    Effect.annotateLogs({ phase, ...annotations }),
    Effect.withLogSpan(phase),
  );
}

export function logDebug(
  event: string,
  annotations: LogAnnotations = {},
): Effect.Effect<void> {
  return Effect.gen(function* () {
    if (!(yield* LoggingEnabled)) return;
    yield* Effect.logDebug(event).pipe(Effect.annotateLogs(annotations));
  });
}
