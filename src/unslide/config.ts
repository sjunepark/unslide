import { access, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv, type ErrorObject } from "ajv";

export const CONFIG_FILE_NAME = "unslide.json";

interface ReportConfigJson {
  source: string;
  html: string;
  captures: string;
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
  captureDirectory: string;
}

export interface ProjectConfig {
  version: 1;
  configPath: string;
  projectRoot: string;
  reports: Record<string, ReportConfig>;
}

const schemaPath = fileURLToPath(new URL("../../schema/unslide.schema.json", import.meta.url));

export async function findProjectConfig(startDirectory = process.cwd()): Promise<string> {
  let directory = resolve(startDirectory);
  while (true) {
    const candidate = resolve(directory, CONFIG_FILE_NAME);
    try {
      await access(candidate);
      return candidate;
    } catch {
      const parent = dirname(directory);
      if (parent === directory) {
        throw new Error(`No ${CONFIG_FILE_NAME} found from ${resolve(startDirectory)} or its parent directories.`);
      }
      directory = parent;
    }
  }
}

function formatSchemaErrors(errors: ErrorObject[]): string {
  return errors.map((error) => {
    const location = error.instancePath || "configuration";
    if (error.keyword === "additionalProperties") {
      return `${location} contains unknown field "${String(error.params.additionalProperty)}"`;
    }
    return `${location} ${error.message ?? "is invalid"}`;
  }).join("; ");
}

function resolveProjectPath(projectRoot: string, value: string, field: string, reportName: string): string {
  if (isAbsolute(value)) {
    throw new Error(`Report "${reportName}" field "${field}" must be relative to the project root.`);
  }
  const resolvedPath = resolve(projectRoot, value);
  const relativePath = relative(projectRoot, resolvedPath);
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`Report "${reportName}" field "${field}" must resolve inside the project root.`);
  }
  return resolvedPath;
}

function pathsOverlap(first: string, second: string): boolean {
  const firstToSecond = relative(first, second);
  const secondToFirst = relative(second, first);
  return firstToSecond === "" || (!firstToSecond.startsWith(`..${sep}`) && firstToSecond !== "..") || (!secondToFirst.startsWith(`..${sep}`) && secondToFirst !== "..");
}

async function canonicalProjectPath(projectRoot: string, inputPath: string, field: string, reportName: string): Promise<string> {
  let existingAncestor = inputPath;
  let canonicalPath: string;

  while (true) {
    try {
      const canonicalAncestor = await realpath(existingAncestor);
      canonicalPath = resolve(canonicalAncestor, relative(existingAncestor, inputPath));
      break;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      const parent = dirname(existingAncestor);
      if (parent === existingAncestor) throw error;
      existingAncestor = parent;
    }
  }

  const canonicalRoot = await realpath(projectRoot);
  const relativePath = relative(canonicalRoot, canonicalPath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Report "${reportName}" field "${field}" must resolve inside the project root; a symbolic link points outside it.`);
  }
  return canonicalPath;
}

export async function loadProjectConfig(startDirectory = process.cwd()): Promise<ProjectConfig> {
  const configPath = await findProjectConfig(startDirectory);
  const projectRoot = dirname(configPath);

  let configJson: unknown;
  try {
    configJson = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot parse ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof configJson === "object" && configJson !== null && Object.hasOwn(configJson, "version")) {
    const version = (configJson as { version?: unknown }).version;
    if (version !== 1) {
      throw new Error(
        `Unsupported ${CONFIG_FILE_NAME} version ${JSON.stringify(version)}. This release supports version 1; update the configuration manually because automatic migration is not available.`,
      );
    }
  }

  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile<ProjectConfigJson>(schema);
  if (!validate(configJson)) {
    throw new Error(`Invalid ${configPath}: ${formatSchemaErrors(validate.errors ?? [])}`);
  }

  const reports: Record<string, ReportConfig> = {};
  const canonicalReports: Record<string, ReportConfig> = {};
  for (const [name, report] of Object.entries(configJson.reports)) {
    const sourcePath = resolveProjectPath(projectRoot, report.source, "source", name);
    const htmlPath = resolveProjectPath(projectRoot, report.html, "html", name);
    const captureDirectory = resolveProjectPath(projectRoot, report.captures, "captures", name);

    try {
      await access(sourcePath);
    } catch {
      throw new Error(`Report "${name}" source does not exist: ${sourcePath}`);
    }
    reports[name] = { name, sourcePath, htmlPath, captureDirectory };
    canonicalReports[name] = {
      name,
      sourcePath: await canonicalProjectPath(projectRoot, sourcePath, "source", name),
      htmlPath: await canonicalProjectPath(projectRoot, htmlPath, "html", name),
      captureDirectory: await canonicalProjectPath(projectRoot, captureDirectory, "captures", name),
    };
  }

  const sources = Object.values(canonicalReports).map((report) => ({
    reportName: report.name,
    path: report.sourcePath,
  }));
  const outputs = Object.values(canonicalReports).flatMap((report) => [
    { reportName: report.name, field: "html", path: report.htmlPath },
    { reportName: report.name, field: "captures", path: report.captureDirectory },
  ]);

  for (const output of outputs) {
    for (const source of sources) {
      if (pathsOverlap(output.path, source.path)) {
        throw new Error(
          `Report "${output.reportName}" field "${output.field}" overlaps report "${source.reportName}" source: ${source.path}`,
        );
      }
    }
  }

  for (const [index, output] of outputs.entries()) {
    for (const other of outputs.slice(index + 1)) {
      if (pathsOverlap(output.path, other.path)) {
        throw new Error(
          `Report "${output.reportName}" field "${output.field}" overlaps report "${other.reportName}" field "${other.field}".`,
        );
      }
    }
  }

  return { version: 1, configPath, projectRoot, reports };
}

export function getReport(config: ProjectConfig, name: string): ReportConfig {
  if (!Object.hasOwn(config.reports, name)) {
    throw new Error(`Unknown report "${name}". Available reports: ${Object.keys(config.reports).join(", ")}.`);
  }
  return config.reports[name] as ReportConfig;
}
