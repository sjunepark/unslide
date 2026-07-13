import { Effect, Exit, type FileSystem, type Path } from "effect";
import { causeMessage } from "../src/unslide/lifecycle.js";
import { applicationLayer } from "../src/unslide/runtime.js";

export interface RunOptions {
  readonly signal?: AbortSignal;
}

export function runUnslide<A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
  options: RunOptions = {},
): Promise<A> {
  return Effect.runPromiseExit(effect.pipe(Effect.provide(applicationLayer)), options).then((exit) => {
    if (Exit.isSuccess(exit)) return exit.value;
    throw new Error(causeMessage(exit.cause), { cause: exit.cause });
  });
}
