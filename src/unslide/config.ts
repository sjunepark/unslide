import { access, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { Effect } from "effect";
import { ProjectConfigFailure, ProjectNotFound, ReportNotFound } from "./failures.js";
import { canonicalizeThroughExistingAncestor, pathsOverlap } from "./paths.js";

export const CONFIG_FILE_NAME = "unslide.json";

interface ReportConfigJson {
  source: string;
  html?: string;
  pdf?: string;
  captures?: string;
  pdfCaptures?: string;
}

interface ProjectConfigJson {
  $schema?: string;
  version: 1;
  reports: Record<string, ReportConfigJson>;
}

export interface ReportConfig {
  name: string;
  sourcePath: string;
  htmlPath: string;
  pdfPath: string;
  captureDirectory: string;
  pdfCaptureDirectory: string;
  manifestPath: string;
}

type ReportConfigWithoutManifest = Omit<ReportConfig, "manifestPath">;

export interface ProjectConfig {
  version: 1;
  configPath: string;
  projectRoot: string;
  reports: Record<string, ReportConfig>;
}

const schemaPath = fileURLToPath(new URL("../../schema/unslide.schema.json", import.meta.url));
let projectConfigValidator: ValidateFunction<ProjectConfigJson> | undefined;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is Error & { readonly code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

function nodeFailure(
  cause: unknown,
  path: string,
  phase: "read" | "resolve",
  message = errorMessage(cause),
  code?: "command-failed" | "project-config-invalid" | "project-config-unreadable",
  detail?: string,
): ProjectConfigFailure {
  if (!isNodeError(cause)) throw cause;
  return new ProjectConfigFailure({ cause, code, detail, message, path, phase });
}

export const findProjectConfig = Effect.fn("config.findProjectConfig")(function* (
  startDirectory: string = process.cwd(),
) {
  let directory = resolve(startDirectory);
  while (true) {
    const candidate = resolve(directory, CONFIG_FILE_NAME);
    const exists = yield* Effect.promise(() =>
      access(candidate).then(
        () => true,
        (cause) => {
          if (!isNodeError(cause)) throw cause;
          return false;
        },
      ),
    );
    if (exists) return candidate;

    const parent = dirname(directory);
    if (parent === directory) {
      const absoluteStart = resolve(startDirectory);
      return yield* new ProjectNotFound({
        message: `No ${CONFIG_FILE_NAME} found from ${absoluteStart} or its parent directories.`,
        startDirectory: absoluteStart,
      });
    }
    directory = parent;
  }
});

function formatSchemaErrors(errors: ErrorObject[]): string {
  return errors
    .map((error) => {
      const location = error.instancePath || "configuration";
      if (error.keyword === "additionalProperties") {
        return `${location} contains unknown field "${String(error.params.additionalProperty)}"`;
      }
      return `${location} ${error.message ?? "is invalid"}`;
    })
    .join("; ");
}

function resolveProjectPath(
  configPath: string,
  projectRoot: string,
  value: string,
  field: string,
  reportName: string,
) {
  if (isAbsolute(value)) {
    return Effect.fail(
      new ProjectConfigFailure({
        message: `Report "${reportName}" field "${field}" must be relative to the project root.`,
        path: configPath,
        phase: "resolve",
      }),
    );
  }
  const resolvedPath = resolve(projectRoot, value);
  const relativePath = relative(projectRoot, resolvedPath);
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    return Effect.fail(
      new ProjectConfigFailure({
        message: `Report "${reportName}" field "${field}" must resolve inside the project root.`,
        path: configPath,
        phase: "resolve",
      }),
    );
  }
  return Effect.succeed(resolvedPath);
}

const canonicalProjectPath = Effect.fn("config.canonicalProjectPath")(function* (
  configPath: string,
  projectRoot: string,
  inputPath: string,
  field: string,
  reportName: string,
) {
  const canonicalPath = yield* Effect.tryPromise({
    try: () => canonicalizeThroughExistingAncestor(inputPath),
    catch: (cause) => nodeFailure(cause, configPath, "resolve"),
  });

  const canonicalRoot = yield* Effect.tryPromise({
    try: () => realpath(projectRoot),
    catch: (cause) => nodeFailure(cause, configPath, "resolve"),
  });
  const relativePath = relative(canonicalRoot, canonicalPath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return yield* new ProjectConfigFailure({
      message: `Report "${reportName}" field "${field}" must resolve inside the project root; a symbolic link points outside it.`,
      path: configPath,
      phase: "resolve",
    });
  }
  return canonicalPath;
});

interface CanonicalSourcePath {
  readonly reportName: string;
  readonly path: string;
}

interface CanonicalOutputPath extends CanonicalSourcePath {
  readonly field: string;
}

const validateReportPathOverlaps = Effect.fn("config.validateReportPathOverlaps")(function* (
  configPath: string,
  sources: readonly CanonicalSourcePath[],
  outputs: readonly CanonicalOutputPath[],
) {
  for (const output of outputs) {
    for (const source of sources) {
      if (pathsOverlap(output.path, source.path)) {
        return yield* new ProjectConfigFailure({
          message: `Report "${output.reportName}" field "${output.field}" overlaps report "${source.reportName}" source: ${source.path}`,
          path: configPath,
          phase: "validate",
        });
      }
    }
  }
  for (const [index, output] of outputs.entries()) {
    for (const other of outputs.slice(index + 1)) {
      if (pathsOverlap(output.path, other.path)) {
        return yield* new ProjectConfigFailure({
          message: `Report "${output.reportName}" field "${output.field}" overlaps report "${other.reportName}" field "${other.field}".`,
          path: configPath,
          phase: "validate",
        });
      }
    }
  }
});

const canonicalManifestCandidate = Effect.fn("config.canonicalManifestCandidate")(function* (
  configPath: string,
  projectRoot: string,
  manifestPath: string,
) {
  const canonicalPath = yield* Effect.tryPromise({
    try: () => canonicalizeThroughExistingAncestor(manifestPath),
    catch: (cause) => nodeFailure(cause, configPath, "resolve"),
  });
  const canonicalRoot = yield* Effect.tryPromise({
    try: () => realpath(projectRoot),
    catch: (cause) => nodeFailure(cause, configPath, "resolve"),
  });
  const relativePath = relative(canonicalRoot, canonicalPath);
  return relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)
    ? undefined
    : canonicalPath;
});

export const validateProjectConfigContents = Effect.fn("config.validateProjectConfigContents")(
  function* (configPath: string, configText: string) {
    const projectRoot = dirname(configPath);
    const configJson: unknown = yield* Effect.try({
      try: () => JSON.parse(configText),
      catch: (cause) => {
        if (!(cause instanceof SyntaxError)) throw cause;
        return new ProjectConfigFailure({
          cause,
          detail: cause.message,
          message: `Cannot parse ${configPath}: ${cause.message}`,
          path: configPath,
          phase: "parse",
        });
      },
    });

    if (
      typeof configJson === "object" &&
      configJson !== null &&
      Object.hasOwn(configJson, "version")
    ) {
      const version = (configJson as { version?: unknown }).version;
      if (version !== 1) {
        return yield* new ProjectConfigFailure({
          message: `Unsupported ${CONFIG_FILE_NAME} version ${JSON.stringify(version)}. This release supports version 1; update the configuration manually because automatic migration is not available.`,
          path: configPath,
          phase: "validate",
        });
      }
    }

    const validate = yield* Effect.tryPromise({
      try: async () => {
        if (projectConfigValidator) return projectConfigValidator;
        const schemaText = await readFile(schemaPath, "utf8");
        const schema = JSON.parse(schemaText) as object;
        projectConfigValidator = new Ajv({
          allErrors: true,
          strict: true,
        }).compile<ProjectConfigJson>(schema);
        return projectConfigValidator;
      },
      catch: (cause) =>
        nodeFailure(cause, schemaPath, "read", errorMessage(cause), "command-failed"),
    });
    if (!validate(configJson)) {
      return yield* new ProjectConfigFailure({
        message: `Invalid ${configPath}: ${formatSchemaErrors(validate.errors ?? [])}`,
        path: configPath,
        phase: "validate",
      });
    }

    const reports: Record<string, ReportConfigWithoutManifest> = {};
    const canonicalReports: Record<string, ReportConfigWithoutManifest> = {};
    for (const [name, report] of Object.entries(configJson.reports)) {
      const html = report.html ?? `artifacts/${name}.html`;
      const captures = report.captures ?? `.tmp/captures/${name}`;
      const sourcePath = yield* resolveProjectPath(
        configPath,
        projectRoot,
        report.source,
        "source",
        name,
      );
      const htmlPath = yield* resolveProjectPath(configPath, projectRoot, html, "html", name);
      const pdfPath = yield* resolveProjectPath(
        configPath,
        projectRoot,
        report.pdf ??
          (report.html === undefined ? `artifacts/${name}.pdf` : html.replace(/\.html$/, ".pdf")),
        "pdf",
        name,
      );
      const captureDirectory = yield* resolveProjectPath(
        configPath,
        projectRoot,
        captures,
        "captures",
        name,
      );
      const pdfCaptureDirectory = yield* resolveProjectPath(
        configPath,
        projectRoot,
        report.pdfCaptures ??
          (report.captures === undefined ? `.tmp/pdf-captures/${name}` : `${captures}-pdf`),
        "pdfCaptures",
        name,
      );

      reports[name] = {
        name,
        sourcePath,
        htmlPath,
        pdfPath,
        captureDirectory,
        pdfCaptureDirectory,
      };
      canonicalReports[name] = {
        name,
        sourcePath: yield* canonicalProjectPath(
          configPath,
          projectRoot,
          sourcePath,
          "source",
          name,
        ),
        htmlPath: yield* canonicalProjectPath(configPath, projectRoot, htmlPath, "html", name),
        pdfPath: yield* canonicalProjectPath(configPath, projectRoot, pdfPath, "pdf", name),
        captureDirectory: yield* canonicalProjectPath(
          configPath,
          projectRoot,
          captureDirectory,
          "captures",
          name,
        ),
        pdfCaptureDirectory: yield* canonicalProjectPath(
          configPath,
          projectRoot,
          pdfCaptureDirectory,
          "pdfCaptures",
          name,
        ),
      };
    }

    const versionOneSources = Object.values(canonicalReports).map((report) => ({
      reportName: report.name,
      path: report.sourcePath,
    }));
    const versionOneOutputs = Object.values(canonicalReports).flatMap((report) => [
      { reportName: report.name, field: "html", path: report.htmlPath },
      { reportName: report.name, field: "pdf", path: report.pdfPath },
      { reportName: report.name, field: "captures", path: report.captureDirectory },
      { reportName: report.name, field: "pdfCaptures", path: report.pdfCaptureDirectory },
    ]);
    yield* validateReportPathOverlaps(configPath, versionOneSources, versionOneOutputs);

    const occupiedCanonicalPaths = Object.values(canonicalReports).flatMap((report) => [
      report.sourcePath,
      report.htmlPath,
      report.pdfPath,
      report.captureDirectory,
      report.pdfCaptureDirectory,
    ]);
    const resolvedReports: Record<string, ReportConfig> = {};
    const resolvedCanonicalReports: Record<string, ReportConfig> = {};
    for (const report of Object.values(reports)) {
      const stem = report.htmlPath.replace(/\.html$/, ".review");
      for (let suffix = 1; ; suffix += 1) {
        const manifestPath = `${stem}${suffix === 1 ? "" : `-${suffix}`}.json`;
        const canonicalManifestPath = yield* canonicalManifestCandidate(
          configPath,
          projectRoot,
          manifestPath,
        );
        if (!canonicalManifestPath) continue;
        if (occupiedCanonicalPaths.every((path) => !pathsOverlap(canonicalManifestPath, path))) {
          resolvedReports[report.name] = { ...report, manifestPath };
          resolvedCanonicalReports[report.name] = {
            ...(canonicalReports[report.name] as ReportConfigWithoutManifest),
            manifestPath: canonicalManifestPath,
          };
          occupiedCanonicalPaths.push(canonicalManifestPath);
          break;
        }
      }
    }

    const sources = Object.values(resolvedCanonicalReports).map((report) => ({
      reportName: report.name,
      path: report.sourcePath,
    }));
    const outputs = Object.values(resolvedCanonicalReports).flatMap((report) => [
      { reportName: report.name, field: "html", path: report.htmlPath },
      { reportName: report.name, field: "pdf", path: report.pdfPath },
      { reportName: report.name, field: "captures", path: report.captureDirectory },
      { reportName: report.name, field: "pdfCaptures", path: report.pdfCaptureDirectory },
      { reportName: report.name, field: "manifest", path: report.manifestPath },
    ]);

    yield* validateReportPathOverlaps(configPath, sources, outputs);

    return { version: 1 as const, configPath, projectRoot, reports: resolvedReports };
  },
);

export const loadProjectConfig = Effect.fn("config.loadProjectConfig")(function* (
  startDirectory: string = process.cwd(),
) {
  const configPath = yield* findProjectConfig(startDirectory);
  const configText = yield* Effect.tryPromise({
    try: () => readFile(configPath, "utf8"),
    catch: (cause) =>
      nodeFailure(
        cause,
        configPath,
        "read",
        `Cannot read ${configPath}: ${errorMessage(cause)}`,
        "project-config-unreadable",
      ),
  });
  return yield* validateProjectConfigContents(configPath, configText);
});

export function getReport(config: ProjectConfig, name: string) {
  if (!Object.hasOwn(config.reports, name)) {
    const availableReports = Object.keys(config.reports);
    return Effect.fail(
      new ReportNotFound({
        availableReports,
        message: `Unknown report "${name}". Available reports: ${availableReports.join(", ")}.`,
        report: name,
      }),
    );
  }
  return Effect.succeed(config.reports[name] as ReportConfig);
}
