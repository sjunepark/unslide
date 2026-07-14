import { Cause, Data, Effect } from "effect";

export type OperationalErrorCode =
  | "artifact-invalid"
  | "artifact-not-found"
  | "browser-not-installed"
  | "command-failed";

export class ProjectNotFound extends Data.TaggedError("ProjectNotFound")<{
  readonly message: string;
  readonly startDirectory: string;
}> {}

export class ProjectConfigFailure extends Data.TaggedError("ProjectConfigFailure")<{
  readonly cause?: unknown;
  readonly code?: "command-failed" | "project-config-invalid" | "project-config-unreadable";
  readonly detail?: string;
  readonly message: string;
  readonly path: string;
  readonly phase: "read" | "parse" | "validate" | "resolve";
}> {}

export class ReportNotFound extends Data.TaggedError("ReportNotFound")<{
  readonly availableReports: readonly string[];
  readonly message: string;
  readonly report: string;
}> {}

export class CommandFailure extends Data.TaggedError("CommandFailure")<{
  readonly cause: unknown;
  readonly code: OperationalErrorCode;
  readonly command: string;
  readonly message: string;
  readonly path?: string;
  readonly report?: string;
}> {}

export interface CommandFailureContext {
  readonly code?: OperationalErrorCode;
  readonly command: string;
  readonly path?: string;
  readonly report?: string;
}

export function errorMessage(error: unknown): string {
  if (
    error instanceof Error
    && "_tag" in error
    && error._tag === "PlatformError"
    && "cause" in error
    && error.cause instanceof Error
  ) {
    return error.cause.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export function isMissingFileError(error: unknown): boolean {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") return true;
  return typeof error === "object"
    && error !== null
    && "_tag" in error
    && error._tag === "PlatformError"
    && "reason" in error
    && typeof error.reason === "object"
    && error.reason !== null
    && "_tag" in error.reason
    && error.reason._tag === "NotFound";
}

function classifiedCode(cause: unknown): OperationalErrorCode | undefined {
  if (
    typeof cause === "object"
    && cause !== null
    && "cliCode" in cause
    && (
      cause.cliCode === "artifact-invalid"
      || cause.cliCode === "artifact-not-found"
      || cause.cliCode === "browser-not-installed"
      || cause.cliCode === "command-failed"
    )
  ) {
    return cause.cliCode;
  }
  return undefined;
}

export function commandFailure(
  cause: unknown,
  context: CommandFailureContext,
  message?: string,
): CommandFailure {
  if (cause instanceof CommandFailure) {
    return new CommandFailure({
      cause: cause.cause,
      code: context.code ?? cause.code,
      command: context.command,
      message: message ?? cause.message,
      path: context.path ?? cause.path,
      report: context.report ?? cause.report,
    });
  }
  return new CommandFailure({
    cause,
    code: context.code ?? classifiedCode(cause) ?? "command-failed",
    command: context.command,
    message: message ?? errorMessage(cause),
    path: context.path,
    report: context.report,
  });
}

/** Maps every typed failure in a Cause without collapsing combined cleanup evidence. */
export function mapCommandFailure<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  context: CommandFailureContext,
  message: (cause: E) => string = errorMessage,
): Effect.Effect<A, CommandFailure, R> {
  return Effect.catchCause(effect, (cause) => Effect.failCause(Cause.map(
    cause,
    (failure) => failure instanceof CommandFailure
      ? failure
      : commandFailure(
        failure,
        context,
        typeof failure === "object"
        && failure !== null
        && "_tag" in failure
        && failure._tag === "ResourceCleanupFailure"
          ? errorMessage(failure)
          : message(failure),
      ),
  )));
}

export type CliFailure = ProjectNotFound | ProjectConfigFailure | ReportNotFound | CommandFailure;
