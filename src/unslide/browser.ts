import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Browser, BrowserContext, Page, Request } from "playwright";
import { chromium } from "playwright";
import { Cause, Data, Effect } from "effect";
import { errorMessage } from "./failures.js";
import { scoped, type ResourceCleanupFailure } from "./lifecycle.js";
import { logDebug, withLogPhase } from "./logging.js";
import {
  formatArtifactIssues,
  validateArtifact,
  type ArtifactPage,
} from "./protocol.js";

interface ArtifactBrowserSession {
  page: Page;
  pages: ArtifactPage[];
}

const NAVIGATION_TIMEOUT_MS = 5_000;

export class BrowserFailure extends Data.TaggedError("BrowserFailure")<{
  readonly cause?: unknown;
  readonly cliCode?: "artifact-invalid" | "artifact-not-found" | "browser-not-installed" | "command-failed";
  readonly message: string;
  readonly phase: "access" | "launch" | "context" | "page" | "navigation" | "readiness" | "operation";
}> {}

export class ArtifactOperationFailure extends Data.TaggedError("ArtifactOperationFailure")<{
  readonly message: string;
}> {}

function displayResource(url: string): string {
  if (!url.startsWith("file:")) return url;
  try {
    return fileURLToPath(url);
  } catch {
    return url;
  }
}

/**
 * Opens one canonical HTML artifact in the pinned browser and applies the
 * shared protocol readiness gate. Playwright stays behind this internal seam.
 */
export function withLoadedArtifact<T>(
  input: string,
  operation: (session: ArtifactBrowserSession) => Promise<T>,
): Effect.Effect<T, BrowserFailure | ResourceCleanupFailure> {
  const inputPath = resolve(input);
  const checkAccess = Effect.tryPromise({
    try: () => access(inputPath),
    catch: (cause) => new BrowserFailure({
      cause,
      cliCode: cause instanceof Error && "code" in cause && cause.code === "ENOENT"
        ? "artifact-not-found"
        : "command-failed",
      message: `Cannot read HTML artifact ${inputPath}: ${errorMessage(cause)}`,
      phase: "access",
    }),
  });

  const checkBrowserExecutable = Effect.tryPromise({
    try: () => access(chromium.executablePath()),
    catch: (cause) => new BrowserFailure({
      cause,
      cliCode: cause instanceof Error && "code" in cause && cause.code === "ENOENT"
        ? "browser-not-installed"
        : "command-failed",
      message: "Cannot access the canonical Chromium executable.",
      phase: "launch",
    }),
  });

  const acquireBrowser = Effect.acquireRelease(
    Effect.tryPromise({
      try: () => chromium.launch(),
      catch: (cause) => new BrowserFailure({
        cause,
        cliCode: "command-failed",
        message: "Cannot launch the canonical Chromium browser.",
        phase: "launch",
      }),
    }),
    (browser: Browser) => Effect.promise(() => browser.close()),
  );
  const acquireContext = (browser: Browser) => Effect.acquireRelease(
    Effect.tryPromise({
      try: () => browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
      }),
      catch: (cause) => new BrowserFailure({
        cause,
        message: `Cannot create the canonical browser context: ${cause instanceof Error ? cause.message : String(cause)}`,
        phase: "context",
      }),
    }),
    (context: BrowserContext) => Effect.promise(() => context.close()),
  );
  const acquirePage = (context: BrowserContext) => Effect.acquireRelease(
    Effect.tryPromise({
      try: () => context.newPage(),
      catch: (cause) => new BrowserFailure({
        cause,
        message: `Cannot create the canonical browser page: ${cause instanceof Error ? cause.message : String(cause)}`,
        phase: "page",
      }),
    }),
    (page: Page) => Effect.promise(() => page.close()),
  );

  const loadedArtifact = Effect.gen(function* () {
    yield* checkAccess;
    yield* checkBrowserExecutable;
    const browser = yield* withLogPhase(acquireBrowser, "browser.launch", { path: inputPath });
    const context = yield* acquireContext(browser);
    const page = yield* acquirePage(context);
    yield* logDebug("browser.page.created", { path: inputPath });
    const browserIssues: string[] = [];
    const pendingResources = new Set<Request>();
    page.on("request", (request) => {
      if (request.resourceType() !== "document") pendingResources.add(request);
    });
    page.on("requestfinished", (request) => pendingResources.delete(request));
    page.on("console", (message) => {
      if (message.type() === "error") browserIssues.push(`Console error: ${message.text()}`);
    });
    page.on("pageerror", (error) => browserIssues.push(`Page error: ${error.message}`));
    page.on("requestfailed", (request) => {
      pendingResources.delete(request);
      browserIssues.push(
        `Resource failed: ${displayResource(request.url())} (${request.failure()?.errorText ?? "unknown error"})`,
      );
    });

    yield* withLogPhase(
      Effect.tryPromise({
        try: () => page.goto(pathToFileURL(inputPath).href, {
          waitUntil: "domcontentloaded",
          timeout: 0,
        }),
        catch: (cause) => new BrowserFailure({
          cause,
          message: errorMessage(cause),
          phase: "navigation",
        }),
      }).pipe(
        Effect.timeout(NAVIGATION_TIMEOUT_MS),
        Effect.mapError((error) => {
          const pending = [...pendingResources].map((request) => displayResource(request.url()));
          const detail = Cause.isTimeoutError(error)
            ? `Navigation did not finish within ${NAVIGATION_TIMEOUT_MS}ms.`
            : errorMessage(error);
          return new BrowserFailure({
            cause: error,
            message: `Cannot load HTML artifact ${inputPath}${pending.length === 0 ? "" : `. Pending resources: ${pending.join(", ")}`}: ${detail}`,
            phase: "navigation",
          });
        }),
      ),
      "browser.navigate",
      { path: inputPath },
    );

    // validateArtifact must remain closure-free for Playwright serialization.
    const validation = yield* withLogPhase(
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () => page.evaluate(validateArtifact),
          catch: (cause) => new BrowserFailure({
            cause,
            message: errorMessage(cause),
            phase: "readiness",
          }),
        });
        const issues = [
          ...(result.ok ? [] : [formatArtifactIssues(result.issues)]),
          ...browserIssues,
          ...[...pendingResources].map((request) => `Resource still pending: ${displayResource(request.url())}`),
        ];
        if (issues.length > 0) {
          return yield* new BrowserFailure({
            cliCode: "artifact-invalid",
            message: `Artifact readiness failed:\n${issues.join("\n")}`,
            phase: "readiness",
          });
        }
        return result;
      }),
      "browser.readiness",
      { path: inputPath },
    );
    yield* logDebug("browser.artifact.ready", {
      pageCount: validation.pages.length,
      path: inputPath,
    });

    const result = yield* Effect.tryPromise({
      try: () => operation({ page, pages: validation.pages }),
      catch: (cause) => new BrowserFailure({
        cause,
        cliCode: cause instanceof ArtifactOperationFailure ? "artifact-invalid" : "command-failed",
        message: errorMessage(cause),
        phase: "operation",
      }),
    });
    const operationIssues = [
      ...browserIssues,
      ...[...pendingResources].map((request) => `Resource still pending: ${displayResource(request.url())}`),
    ];
    if (operationIssues.length > 0) {
      return yield* new BrowserFailure({
        cliCode: "artifact-invalid",
        message: `Artifact browser errors:\n${operationIssues.join("\n")}`,
        phase: "operation",
      });
    }
    return result;
  });

  return scoped(loadedArtifact);
}
