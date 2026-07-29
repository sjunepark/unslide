# CLI Result and Review Manifest Contract

This document defines result schema v1 for the active consumer-authoring plan.
It is encoding-independent: TOON and JSON decode to the same value. Existing
primitive commands use this schema; later numbered goals add the remaining
result variants without changing the envelope.

## Result Envelope

Every invocation emits exactly one object followed by one newline. JSON is
compact UTF-8 JSON; TOON uses the package's canonical TOON encoder.

```ts
type CommandName =
  | "home"
  | "help"
  | "init"
  | "add"
  | "report"
  | "build"
  | "inspect"
  | "capture"
  | "export"
  | "inspect-pdf"
  | "review"
  | "unknown";

interface ResultEnvelopeBase {
  resultSchemaVersion: 1;
  toolVersion: string;
  command: CommandName;
  warnings: ResultWarning[];
  timings: StepTiming[];
  help: string[];
}

type ResultEnvelope =
  | (ResultEnvelopeBase & {
      status: "ok";
      result: CommandResult;
    })
  | (ResultEnvelopeBase & {
      status: "error";
      error: ResultError;
      result?: PartialCommandResult;
    });
```

Success has `status: "ok"`, a command-specific `result`, and no `error`.
Failure has `status: "error"` and one `error`; it may retain a partial `result`
when completed work is useful, such as `review --all`. Arrays are present even
when empty. Optional object fields are omitted rather than encoded as `null`.

`toolVersion` is the executing package version. Exit 0 means success or
idempotent no-op, exit 1 means operational failure, and exit 2 means invalid usage.
Default stderr is empty; enabled diagnostic logging remains JSON Lines on
stderr and is not part of this schema.

```ts
interface ResultError {
  code: string;
  message: string;
  detail?: string;
  path?: string;
  report?: string;
  availableReports?: string[];
  diagnostics?: DiagnosticSummary;
}

interface DiagnosticSummary {
  shown: number;
  total: number;
  truncated: boolean;
  issues: Array<{
    source: string;
    code: string;
    message: string;
    messageTotalChars?: number;
    pageId?: string;
    resource?: string;
    resourceTotalChars?: number;
  }>;
}

interface ResultWarning {
  code: string;
  message: string;
  path?: string;
  pageId?: string;
}

interface StepTiming {
  step: string;
  status: "completed" | "failed";
  durationMs: number;
}
```

Durations are non-negative integer milliseconds measured with a monotonic
clock. Timings preserve execution order; unrequested and not-started steps are
omitted. A failed step is included, and total command duration is not presented
as a synthetic step. Timings are operational evidence, not a performance
guarantee.

Existing stable error codes and diagnostic bounds remain. Source loading,
invalid exports, asset reads, and stylesheet compilation add a bounded
author-facing `detail`; dependency stacks and raw causes remain debug-only.
Report-authored console output and React warnings are captured during source
evaluation and rendering and can appear only as bounded structured debug logs,
never as extra stdout bytes or unstructured default stderr.

The stable codes are `usage`, `project-not-found`,
`project-config-unreadable`, `project-config-invalid`, `report-not-found`,
`source-not-found`, `artifact-not-found`, `artifact-invalid`,
`browser-not-installed`, and `command-failed`. `source-not-found` distinguishes
the newly isolated report state; existing codes retain their meanings. Default
diagnostics show at most 10 issues and 1,000 Unicode characters per authored
message or resource, with exact totals. Author-facing `detail` is also limited
to 1,000 Unicode characters. `--full` removes issue and authored-text
truncation only for commands that accept it, never cause or stack redaction.

The initial warning code is `sensitive-output-not-ignored`, emitted by `init`
or `add` when conventional report outputs are not covered by an existing
ignore file. Warning codes are stable within a result-schema version.

## Shared Evidence Types

All public filesystem paths are normalized absolute paths so callers can use
them directly regardless of project discovery depth.

```ts
interface MissingPathState {
  kind: "file" | "directory";
  path: string;
  exists: false;
}

interface PresentPathState {
  kind: "file" | "directory";
  path: string;
  exists: true;
  modifiedAt: string;
}

type PathState = MissingPathState | PresentPathState;

interface FileEvidence {
  path: string;
  bytes: number;
  sha256: string;
}

interface InspectedHtmlPage {
  id: string;
  number: number;
  element: string;
}

interface CapturedHtmlPage {
  id: string;
  number: number;
  path: string;
  widthPixels: number;
  heightPixels: number;
  bytes: number;
  sha256: string;
}

interface ExportedPdfPage {
  number: number;
  id: string;
  widthPoints: number;
  heightPoints: number;
}

interface CapturedPdfPage {
  number: number;
  id?: string;
  path: string;
  widthPixels: number;
  heightPixels: number;
  bytes: number;
  sha256: string;
}

interface ScopeAll {
  kind: "all";
}

interface HtmlScopePage {
  kind: "page";
  number: number;
  id: string;
}

interface PdfScopePage {
  kind: "page";
  number: number;
}

interface ReportState {
  name: string;
  source: PathState;
  html: PathState;
  pdf: PathState;
  captures: PathState;
  pdfCaptures: PathState;
  manifest: PathState;
}

type PublishedStep =
  | { step: string; status: "completed"; published: boolean }
  | { step: string; status: "failed"; published: false };
```

`number` is always one-based. Result schema v1 removes the public `index`
field rather than preserving incompatible zero- and one-based meanings.
Internal protocol implementations may retain zero-based indexes. HTML-derived
pages always have `id`; standalone PDF inspection omits it because a PDF has no
protocol page ID. Review may correlate PDF pages to HTML IDs only after the
supported page-parity validation succeeds.

Dimensions state their unit in the field name. `bytes` is the exact published
file length. `sha256` is lowercase hexadecimal SHA-256 over those exact bytes.
An existing path's `modifiedAt` is an RFC 3339 UTC filesystem observation, not
a freshness claim.

## Command Results

The envelope's `result` is one of these discriminated records:

```ts
interface ProjectChangeBase<FileStatus extends string> {
  kind: "project-change";
  operation: "init" | "add";
  projectRoot: string;
  report: string;
  starter: "minimal" | "business-report";
  files: Array<{
    path: string;
    status: FileStatus;
  }>;
}

type ProjectChangeResult =
  | (ProjectChangeBase<"create" | "unchanged"> & { status: "planned" })
  | (ProjectChangeBase<"created" | "unchanged"> & { status: "created" })
  | (ProjectChangeBase<"unchanged"> & { status: "unchanged" });

type ProjectChangeConflict = ProjectChangeBase<"create" | "unchanged" | "conflict"> & {
  status: "conflict";
};

type InitOperationalFailure = ProjectChangeBase<
  "created" | "unchanged" | "failed" | "not-started"
> & {
  operation: "init";
  status: "failed";
};

type ProjectChangeFailure = ProjectChangeConflict | InitOperationalFailure;

type CommandResult =
  | { kind: "home"; projectRoot: string; reports: ReportState[] }
  | {
      kind: "help";
      usage: string;
      description?: string;
      flags: Array<{ flag: string; description: string }>;
      commands?: Array<{ command: string; description: string }>;
      examples: string[];
    }
  | ProjectChangeResult
  | { kind: "report"; report: ReportState }
  | { kind: "build"; report: string; html: FileEvidence }
  | { kind: "inspect"; html: FileEvidence; pages: InspectedHtmlPage[] }
  | {
      kind: "capture";
      report?: string;
      html: FileEvidence;
      scope: ScopeAll | HtmlScopePage;
      output: PathState;
      pages: CapturedHtmlPage[];
    }
  | {
      kind: "export";
      report?: string;
      html: FileEvidence;
      pdf: FileEvidence;
      pages: ExportedPdfPage[];
    }
  | {
      kind: "inspect-pdf";
      report?: string;
      pdf: FileEvidence;
      scope: ScopeAll | PdfScopePage;
      output: PathState;
      pages: CapturedPdfPage[];
    }
  | { kind: "review"; reports: ReviewSummary[] };

interface ReviewSummaryBase {
  report: string;
  requestedScope: RequestedReviewScope;
  pdf?: FileEvidence;
  pages: ReviewPage[];
  steps: PublishedStep[];
  warnings: ResultWarning[];
  timings: StepTiming[];
}

type ReviewSummary =
  | (ReviewSummaryBase & {
      status: "ok";
      scope: ScopeAll | HtmlScopePage;
      html: FileEvidence;
      manifest: { status: "published" } & FileEvidence;
    })
  | (ReviewSummaryBase & {
      status: "error";
      scope?: ScopeAll | HtmlScopePage;
      html?: FileEvidence;
      manifest: { status: "unchanged"; state: PathState };
      error: ResultError;
    });

type PartialCommandResult = ProjectChangeFailure | { kind: "review"; reports: ReviewSummary[] };
```

An operational `init` failure reports files already left on disk as `created`,
the failed write as `failed`, and remaining planned writes as `not-started`.
`add` does not use this variant because publication failure rolls back its
staged files and leaves the project unchanged.

A review error may occur before a focused selector can be resolved against
validated HTML. Every summary therefore preserves the requested selector
separately; `scope` is required on success and present on failure only after
resolution completed:

```ts
type RequestedReviewScope =
  ScopeAll | { kind: "page-id"; id: string } | { kind: "page-number"; number: number };
```

Configured forms include `report`; artifact forms omit it. A focused HTML
result includes both page ID and number after resolution. A standalone focused
PDF result includes only number. Help for the top level or one command uses the
same `help` result; error envelopes place recovery invocations in the
envelope's `help` array rather than returning a second help result.

Failure results identify every completed or failed review step and whether its
output was published. They never claim an output from an unstarted step. In an
all-reports result, each report has its own `ok` or `error` status and error
record; the top-level status is `error` when any report failed.

For `review`, warnings and timings produced inside one report are stored in its
`ReviewSummary`. The envelope arrays contain only invocation-level evidence,
such as project discovery; they do not duplicate or flatten report evidence.

## Review Manifest

Each configured report has one derived manifest path. First replace the
configured HTML path's `.html` suffix with `.review.json`. If that candidate
overlaps a version-1 source or artifact path, append `-2`, then the next
positive integer as needed, before `.json` and choose the first nonoverlapping
candidate. The conventional location is `artifacts/<name>.review.json`. This
collision escape preserves every previously valid explicit version-1 path
without adding a configuration field. The selected manifest path is included
in the same confinement, symlink, source/output, and cross-report overlap
validation as other outputs.

The manifest is compact UTF-8 JSON followed by one newline. Its semantic model
is independent of the invocation's stdout format.

```ts
interface ReviewManifest {
  manifestSchemaVersion: 1;
  resultSchemaVersion: 1;
  toolVersion: string;
  report: string;
  createdAt: string;
  scope: { kind: "all" } | { kind: "page"; id: string; number: number };
  html: FileEvidence;
  pdf?: FileEvidence;
  pages: ReviewPage[];
  warnings: ResultWarning[];
  timings: StepTiming[];
}

interface ReviewPageBase {
  id: string;
  number: number;
  pdfGeometry?: {
    widthPoints: number;
    heightPoints: number;
  };
}

type ReviewPage =
  | (ReviewPageBase & { selected: false })
  | (ReviewPageBase & {
      selected: true;
      htmlCapture: FileEvidence & {
        widthPixels: number;
        heightPixels: number;
      };
      pdfCapture?: FileEvidence & {
        widthPixels: number;
        heightPixels: number;
      };
    });
```

The manifest lists every validated HTML page in document order. `selected`
states the rasterized scope; capture evidence is present only for selected
pages. HTML-only review omits `pdf`, `pdfCapture`, and `pdfGeometry`, even if
older PDF files remain on disk. A focused review replaces earlier complete
review evidence rather than carrying unverified pages forward.

`createdAt` is the successful review completion time in RFC 3339 UTC. Manifest
timings cover build, HTML validation, HTML capture, optional PDF export and
validation, optional PDF inspection, and manifest publication preparation.
Manifest publication itself is not timed inside the document it publishes.

The manifest is staged beside its destination and renamed only after every
requested step succeeds. A failure never replaces the previous manifest.
Because prior successful review steps publish independently, the previous
manifest can become stale after a later step fails. Consumers verify every
recorded `FileEvidence` path, byte size, and hash—including HTML, PDF, and page
captures—before trusting an unchanged manifest. Failure stdout reports the
manifest as unchanged and lists already-published steps. No separate failure
manifest is written.
