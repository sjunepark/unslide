import { formatWithOptions } from "node:util";
import { Effect, Exit } from "effect";
import { logDebug } from "./logging.js";

const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARACTERS = 1_000;
const METHODS = ["debug", "error", "info", "log", "trace", "warn"] as const;

type ConsoleMethod = (typeof METHODS)[number];

interface CapturedMessage {
  readonly level: ConsoleMethod;
  readonly message: string;
  readonly messageTotalChars?: number;
}

interface CaptureState {
  readonly messages: CapturedMessage[];
  readonly originals: Record<ConsoleMethod, Console[ConsoleMethod]>;
  skipped: number;
}

function boundedMessage(arguments_: readonly unknown[]): Omit<CapturedMessage, "level"> {
  const rendered = formatWithOptions(
    { colors: false, depth: 3, maxArrayLength: 20, maxStringLength: 1_000 },
    ...arguments_,
  );
  const characters = [...rendered];
  if (characters.length <= MAX_MESSAGE_CHARACTERS) return { message: rendered };
  return {
    message: `${characters.slice(0, MAX_MESSAGE_CHARACTERS - 1).join("")}…`,
    messageTotalChars: characters.length,
  };
}

function installCapture(): CaptureState {
  const originals = Object.fromEntries(
    METHODS.map((method) => [method, console[method]]),
  ) as Record<ConsoleMethod, Console[ConsoleMethod]>;
  const state: CaptureState = { messages: [], originals, skipped: 0 };
  for (const method of METHODS) {
    console[method] = (...arguments_: unknown[]) => {
      if (state.messages.length >= MAX_MESSAGES) {
        state.skipped += 1;
        return;
      }
      state.messages.push({ level: method, ...boundedMessage(arguments_) });
    };
  }
  return state;
}

function restoreCapture(state: CaptureState): void {
  for (const method of METHODS) console[method] = state.originals[method];
}

/** Keeps report-authored console calls out of stdout and default stderr. */
export function captureReportConsole<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  phase: "source-evaluation" | "render",
  report?: string,
): Effect.Effect<A, E, R> {
  return Effect.gen(function* () {
    let captured: CaptureState | undefined;
    const exit = yield* Effect.exit(
      Effect.acquireUseRelease(
        Effect.sync(() => installCapture()),
        (state) => {
          captured = state;
          return effect.pipe(
            Effect.onExit(() =>
              Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve))),
            ),
          );
        },
        (state) => Effect.sync(() => restoreCapture(state)),
      ),
    );
    if (captured) {
      yield* Effect.forEach(
        captured.messages,
        (message) =>
          logDebug("report.console", {
            level: message.level,
            message: message.message,
            ...(message.messageTotalChars === undefined
              ? {}
              : { messageTotalChars: message.messageTotalChars }),
            phase,
            ...(report === undefined ? {} : { report }),
          }),
        { discard: true },
      );
      if (captured.skipped > 0) {
        yield* logDebug("report.console.truncated", {
          phase,
          ...(report === undefined ? {} : { report }),
          skipped: captured.skipped,
        });
      }
    }
    if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);
    return exit.value;
  });
}
