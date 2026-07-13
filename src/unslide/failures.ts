import { Data } from "effect";

export class ProjectNotFound extends Data.TaggedError("ProjectNotFound")<{
  readonly message: string;
  readonly startDirectory: string;
}> {}

export class ProjectConfigFailure extends Data.TaggedError("ProjectConfigFailure")<{
  readonly cause?: unknown;
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
  readonly command: string;
  readonly message: string;
  readonly path?: string;
  readonly report?: string;
}> {}

export type CliFailure = ProjectNotFound | ProjectConfigFailure | ReportNotFound | CommandFailure;
