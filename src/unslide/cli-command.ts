import type { CliLogLevel } from "./logging.js";

export type OutputFormat = "toon" | "json";
type Starter = "minimal" | "business-report";

export type CommandName =
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

export type HtmlPageSelector =
  | { readonly kind: "page-id"; readonly id: string }
  | { readonly kind: "page-number"; readonly number: number };

export interface HelpResult {
  readonly kind: "help";
  readonly usage: string;
  readonly description?: string;
  readonly flags: ReadonlyArray<{ readonly flag: string; readonly description: string }>;
  readonly commands?: ReadonlyArray<{
    readonly command: string;
    readonly description: string;
  }>;
  readonly examples: readonly string[];
}

export type ParsedCommand =
  | { readonly kind: "home" }
  | { readonly kind: "help"; readonly help: HelpResult }
  | {
      readonly kind: "init";
      readonly name: string;
      readonly nameWasExplicit: boolean;
      readonly starter: Starter;
      readonly write: boolean;
    }
  | {
      readonly kind: "add";
      readonly name: string;
      readonly starter: Starter;
      readonly write: boolean;
    }
  | { readonly kind: "report"; readonly report: string }
  | { readonly kind: "build"; readonly report: string }
  | {
      readonly kind: "inspect";
      readonly full: boolean;
      readonly target:
        | { readonly kind: "report"; readonly report: string }
        | { readonly kind: "artifact"; readonly path: string };
    }
  | {
      readonly kind: "capture";
      readonly full: boolean;
      readonly selector?: HtmlPageSelector;
      readonly target:
        | { readonly kind: "report"; readonly report: string }
        | { readonly kind: "artifact"; readonly path: string; readonly output: string };
    }
  | {
      readonly kind: "export";
      readonly full: boolean;
      readonly target:
        | { readonly kind: "report"; readonly report: string }
        | { readonly kind: "artifact"; readonly path: string; readonly output: string };
    }
  | {
      readonly kind: "inspect-pdf";
      readonly pageNumber?: number;
      readonly target:
        | { readonly kind: "report"; readonly report: string }
        | {
            readonly kind: "artifact";
            readonly path: string;
            readonly output: string;
          };
    }
  | {
      readonly kind: "review";
      readonly full: boolean;
      readonly pdf: boolean;
      readonly target:
        | { readonly kind: "all" }
        | {
            readonly kind: "report";
            readonly report: string;
            readonly selector?: HtmlPageSelector;
          };
    };

export interface GlobalOptions {
  readonly argv: readonly string[];
  readonly format: OutputFormat;
  readonly logLevel: CliLogLevel;
}

export type GlobalOptionsResult =
  | { readonly ok: true; readonly value: GlobalOptions }
  | {
      readonly ok: false;
      readonly command: CommandName;
      readonly format: OutputFormat;
      readonly message: string;
    };

export type CommandParseResult =
  | { readonly ok: true; readonly value: ParsedCommand }
  | {
      readonly ok: false;
      readonly command: CommandName;
      readonly help: readonly string[];
      readonly message: string;
    };

const FORMAT_FLAG = "--format";
const LOG_LEVEL_FLAG = "--log-level";
const LOG_LEVEL_ENV = "UNSLIDE_LOG_LEVEL";
const STARTERS = ["minimal", "business-report"] as const satisfies readonly Starter[];
const OUTPUT_FORMATS = new Set<OutputFormat>(["toon", "json"]);
const LOG_LEVELS = new Set<CliLogLevel>(["off", "info", "debug"]);
const COMMAND_NAMES = new Set<CommandName>([
  "init",
  "add",
  "report",
  "build",
  "inspect",
  "capture",
  "export",
  "inspect-pdf",
  "review",
]);

function isReportName(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function invalidReportName(command: CommandName, value: string, help: HelpResult) {
  return parseFailure(
    command,
    `Invalid report name ${JSON.stringify(value)}; use lower-kebab case.`,
    help,
  );
}

function commandFromArguments(argv: readonly string[]): CommandName {
  let candidate: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === FORMAT_FLAG || argument === LOG_LEVEL_FLAG) {
      index += 1;
      continue;
    }
    if (!argument.startsWith("-")) {
      candidate = argument;
      break;
    }
  }
  return candidate && COMMAND_NAMES.has(candidate as CommandName)
    ? (candidate as CommandName)
    : candidate
      ? "unknown"
      : argv.includes("--help")
        ? "help"
        : "home";
}

interface ExtractedOption {
  readonly argv: readonly string[];
  readonly value?: string;
}

function extractSingletonOption(
  argv: readonly string[],
  flag: string,
  values: ReadonlySet<string>,
  expected: string,
):
  | { readonly ok: true; readonly value: ExtractedOption }
  | { readonly ok: false; message: string } {
  const joined = argv.find((argument) => argument.startsWith(`${flag}=`));
  if (joined) {
    return { ok: false, message: `Use ${flag} ${expected} with a separate value.` };
  }
  const indexes = argv.flatMap((argument, index) => (argument === flag ? [index] : []));
  if (indexes.length > 1) {
    return { ok: false, message: `${flag} may be provided only once.` };
  }
  if (indexes.length === 0) return { ok: true, value: { argv: [...argv] } };

  const index = indexes[0] as number;
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    return { ok: false, message: `${flag} requires ${expected}.` };
  }
  if (!values.has(value)) {
    return {
      ok: false,
      message: `Invalid ${flag} value ${JSON.stringify(value)}; expected ${[...values].join(", ")}.`,
    };
  }
  return {
    ok: true,
    value: {
      argv: argv.filter(
        (_, argumentIndex) => argumentIndex !== index && argumentIndex !== index + 1,
      ),
      value,
    },
  };
}

export function parseGlobalOptions(
  argv: readonly string[],
  environmentLogLevel: string | undefined,
): GlobalOptionsResult {
  const format = extractSingletonOption(argv, FORMAT_FLAG, OUTPUT_FORMATS, "<toon|json>");
  if (!format.ok) {
    return {
      ok: false,
      command: commandFromArguments(argv),
      format: "toon",
      message: format.message,
    };
  }
  const selectedFormat = (format.value.value as OutputFormat | undefined) ?? "toon";
  const logging = extractSingletonOption(
    format.value.argv,
    LOG_LEVEL_FLAG,
    LOG_LEVELS,
    "<off|info|debug>",
  );
  if (!logging.ok) {
    return {
      ok: false,
      command: commandFromArguments(format.value.argv),
      format: selectedFormat,
      message: logging.message,
    };
  }

  let logLevel = logging.value.value as CliLogLevel | undefined;
  if (logLevel === undefined && environmentLogLevel !== undefined) {
    if (!LOG_LEVELS.has(environmentLogLevel as CliLogLevel)) {
      return {
        ok: false,
        command: commandFromArguments(logging.value.argv),
        format: selectedFormat,
        message: `Invalid ${LOG_LEVEL_ENV} value ${JSON.stringify(environmentLogLevel)}; expected off, info, or debug.`,
      };
    }
    logLevel = environmentLogLevel as CliLogLevel;
  }
  return {
    ok: true,
    value: {
      argv: logging.value.argv,
      format: selectedFormat,
      logLevel: logLevel ?? "off",
    },
  };
}

function formatFlag() {
  return {
    flag: "--format <toon|json>",
    description: "Select the result encoding (default: toon)",
  };
}

function logLevelFlag() {
  return {
    flag: "--log-level <off|info|debug>",
    description: `Emit Effect JSON Lines on stderr (default: ${LOG_LEVEL_ENV} or off)`,
  };
}

function helpFlag() {
  return {
    flag: "--help",
    description: "Show concise command help without requiring command values",
  };
}

function fullFlag() {
  return {
    flag: "--full",
    description:
      "Show complete report-authored diagnostics (default: up to 10 issues and 1,000 characters per text field)",
  };
}

export function topHelp(invocation: string): HelpResult {
  return {
    kind: "help",
    usage: `${invocation} [--format <toon|json>] [--log-level <off|info|debug>] <command>`,
    description: "Build and inspect explicit-page HTML and PDF reports",
    flags: [formatFlag(), logLevelFlag(), helpFlag()],
    commands: [
      { command: "init", description: "Plan or create a report project" },
      { command: "add <name>", description: "Plan or add a report to an existing project" },
      { command: "report <name>", description: "Show resolved state for one report" },
      { command: "build <name>", description: "Build a named report to standalone HTML" },
      { command: "inspect <name>", description: "Validate a named report HTML artifact" },
      { command: "inspect --artifact <html>", description: "Validate standalone HTML" },
      { command: "capture <name>", description: "Capture a named report HTML pages" },
      {
        command: "capture --artifact <html> --output <directory>",
        description: "Capture standalone HTML pages",
      },
      { command: "export <name>", description: "Export a named report HTML to PDF" },
      {
        command: "export --artifact <html> --output <pdf>",
        description: "Export standalone HTML to PDF",
      },
      { command: "inspect-pdf <name>", description: "Render a named report PDF to images" },
      {
        command: "inspect-pdf --artifact <pdf> --output <directory>",
        description: "Render a standalone PDF to images",
      },
      { command: "review <name>", description: "Build and review one configured report" },
      { command: "review --all", description: "Build and review every configured report" },
    ],
    examples: [`${invocation} init`, `${invocation} build report`, `${invocation} --help`],
  };
}

export function commandHelp(
  invocation: string,
  command: Exclude<CommandName, "home" | "help" | "unknown">,
): HelpResult {
  const globals = [formatFlag(), logLevelFlag()];
  if (command === "init" || command === "add") {
    const isInit = command === "init";
    return {
      kind: "help",
      usage: isInit
        ? `${invocation} init [--name <name>] [--starter <minimal|business-report>] [--yes]`
        : `${invocation} add <name> [--starter <minimal|business-report>] [--yes]`,
      flags: [
        ...(isInit
          ? [{ flag: "--name <name>", description: "Set the report name (default: report)" }]
          : []),
        {
          flag: "--starter <minimal|business-report>",
          description: "Select the report starter (default: minimal)",
        },
        { flag: "--yes", description: "Create the planned files without prompting" },
        helpFlag(),
        ...globals,
      ],
      examples: [
        ...(isInit
          ? [
              `${invocation} init`,
              `${invocation} init --yes`,
              `${invocation} init --name quarterly-review --starter business-report --yes`,
            ]
          : [
              `${invocation} add quarterly-review`,
              `${invocation} add quarterly-review --starter business-report --yes`,
            ]),
      ],
    };
  }
  if (command === "inspect") {
    return {
      kind: "help",
      usage: `${invocation} inspect <name> | ${invocation} inspect --artifact <html>`,
      flags: [
        {
          flag: "--artifact <html>",
          description: "Inspect standalone HTML instead of a configured report",
        },
        fullFlag(),
        helpFlag(),
        ...globals,
      ],
      examples: [
        `${invocation} inspect report`,
        `${invocation} inspect --artifact artifacts/report.html`,
      ],
    };
  }
  if (command === "inspect-pdf") {
    return {
      kind: "help",
      usage: `${invocation} inspect-pdf <name> | ${invocation} inspect-pdf --artifact <pdf> --output <directory>`,
      flags: [
        {
          flag: "--artifact <pdf>",
          description: "Inspect a standalone PDF instead of a configured report",
        },
        {
          flag: "--output <directory>",
          description: "Write standalone PDF page images to this directory",
        },
        {
          flag: "--page-number <number>",
          description: "Rasterize one one-based PDF page after validating the complete PDF",
        },
        helpFlag(),
        ...globals,
      ],
      examples: [
        `${invocation} inspect-pdf report`,
        `${invocation} inspect-pdf --artifact artifacts/report.pdf --output .tmp/pdf-captures/report`,
      ],
    };
  }
  if (command === "capture") {
    return {
      kind: "help",
      usage: `${invocation} capture <name> | ${invocation} capture --artifact <html> --output <directory>`,
      flags: [
        { flag: "--artifact <html>", description: "Capture standalone HTML" },
        { flag: "--output <directory>", description: "Write standalone page images here" },
        { flag: "--page-id <id>", description: "Capture one page by protocol ID" },
        { flag: "--page-number <number>", description: "Capture one one-based page" },
        fullFlag(),
        helpFlag(),
        ...globals,
      ],
      examples: [
        `${invocation} capture report`,
        `${invocation} capture --artifact artifacts/report.html --output .tmp/captures/report`,
      ],
    };
  }
  if (command === "export") {
    return {
      kind: "help",
      usage: `${invocation} export <name> | ${invocation} export --artifact <html> --output <pdf>`,
      flags: [
        { flag: "--artifact <html>", description: "Export standalone HTML" },
        { flag: "--output <pdf>", description: "Publish the validated PDF here" },
        fullFlag(),
        helpFlag(),
        ...globals,
      ],
      examples: [
        `${invocation} export report`,
        `${invocation} export --artifact artifacts/report.html --output artifacts/report.pdf`,
      ],
    };
  }
  if (command === "review") {
    return {
      kind: "help",
      usage: `${invocation} review <name> | ${invocation} review --all`,
      flags: [
        { flag: "--all", description: "Review every configured report in lexical order" },
        { flag: "--page-id <id>", description: "Review one page by protocol ID" },
        { flag: "--page-number <number>", description: "Review one one-based page" },
        { flag: "--pdf", description: "Also export, validate, and inspect PDF" },
        fullFlag(),
        helpFlag(),
        ...globals,
      ],
      examples: [`${invocation} review report`, `${invocation} review --all --pdf`],
    };
  }
  const flags = [helpFlag(), ...globals];
  return {
    kind: "help",
    usage: `${invocation} ${command} <name>`,
    flags,
    examples: [`${invocation} ${command} report`],
  };
}

function parseFailure(command: CommandName, message: string, help: HelpResult): CommandParseResult {
  return { ok: false, command, message, help: [`Run ${help.examples[0] as string}`] };
}

function parseStarterOption(
  command: "init" | "add",
  value: string | undefined,
  alreadySeen: boolean,
  help: HelpResult,
):
  | { readonly ok: true; readonly starter: Starter }
  | { readonly ok: false; readonly result: CommandParseResult } {
  if (alreadySeen) {
    return {
      ok: false,
      result: parseFailure(command, "--starter may be provided only once.", help),
    };
  }
  if (!value || value.startsWith("-")) {
    return { ok: false, result: parseFailure(command, "--starter requires one value.", help) };
  }
  if (!STARTERS.includes(value as Starter)) {
    return {
      ok: false,
      result: parseFailure(
        command,
        `Invalid --starter value ${JSON.stringify(value)}; expected ${STARTERS.join(", ")}.`,
        help,
      ),
    };
  }
  return { ok: true, starter: value as Starter };
}

function helpCount(argv: readonly string[]): number {
  return argv.filter((argument) => argument === "--help").length;
}

function parseSimpleReportCommand(
  argv: readonly string[],
  invocation: string,
  command: "report" | "build",
): CommandParseResult {
  const help = commandHelp(invocation, command);
  const allowed = new Set(["--help"]);
  const unknown = argv
    .slice(1)
    .find((argument) => argument.startsWith("-") && !allowed.has(argument));
  if (unknown)
    return parseFailure(command, `Unknown flag ${JSON.stringify(unknown)} for ${command}.`, help);
  if (helpCount(argv) > 1) return parseFailure(command, "--help may be provided only once.", help);
  const positionals = argv.slice(1).filter((argument) => argument !== "--help");
  if (positionals.length > 1) {
    return parseFailure(
      command,
      `Unexpected argument ${JSON.stringify(positionals[1])} for ${command}.`,
      help,
    );
  }
  const report = positionals[0];
  if (report && !isReportName(report)) return invalidReportName(command, report, help);
  if (argv.includes("--help")) return { ok: true, value: { kind: "help", help } };
  if (!report) return parseFailure(command, `${command} requires exactly one report name.`, help);
  return { ok: true, value: { kind: command, report } };
}

function parseInit(argv: readonly string[], invocation: string): CommandParseResult {
  const help = commandHelp(invocation, "init");
  let name = "report";
  let nameSeen = false;
  let yesSeen = false;
  let starter: Starter = "minimal";
  let starterSeen = false;
  let missingName = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--help") continue;
    if (argument === "--yes") {
      if (yesSeen) return parseFailure("init", "--yes may be provided only once.", help);
      yesSeen = true;
      continue;
    }
    if (argument === "--name") {
      if (nameSeen) return parseFailure("init", "--name may be provided only once.", help);
      nameSeen = true;
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        missingName = true;
        continue;
      }
      name = value;
      index += 1;
      continue;
    }
    if (argument === "--starter") {
      const parsedStarter = parseStarterOption("init", argv[index + 1], starterSeen, help);
      if (!parsedStarter.ok) return parsedStarter.result;
      starterSeen = true;
      starter = parsedStarter.starter;
      index += 1;
      continue;
    }
    return parseFailure(
      "init",
      argument.startsWith("-")
        ? `Unknown flag ${JSON.stringify(argument)} for init.`
        : `Unexpected argument ${JSON.stringify(argument)} for init.`,
      help,
    );
  }
  if (helpCount(argv) > 1) return parseFailure("init", "--help may be provided only once.", help);
  if (!isReportName(name)) return invalidReportName("init", name, help);
  if (argv.includes("--help")) return { ok: true, value: { kind: "help", help } };
  if (missingName) return parseFailure("init", "--name requires one value.", help);
  return {
    ok: true,
    value: { kind: "init", name, nameWasExplicit: nameSeen, starter, write: yesSeen },
  };
}

function parseAdd(argv: readonly string[], invocation: string): CommandParseResult {
  const help = commandHelp(invocation, "add");
  let name: string | undefined;
  let starter: Starter = "minimal";
  let starterSeen = false;
  let yesSeen = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--help") continue;
    if (argument === "--yes") {
      if (yesSeen) return parseFailure("add", "--yes may be provided only once.", help);
      yesSeen = true;
      continue;
    }
    if (argument === "--starter") {
      const parsedStarter = parseStarterOption("add", argv[index + 1], starterSeen, help);
      if (!parsedStarter.ok) return parsedStarter.result;
      starterSeen = true;
      starter = parsedStarter.starter;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      return parseFailure("add", `Unknown flag ${JSON.stringify(argument)} for add.`, help);
    }
    if (name !== undefined) {
      return parseFailure("add", `Unexpected argument ${JSON.stringify(argument)} for add.`, help);
    }
    name = argument;
  }
  if (helpCount(argv) > 1) return parseFailure("add", "--help may be provided only once.", help);
  if (name !== undefined && !isReportName(name)) return invalidReportName("add", name, help);
  if (argv.includes("--help")) return { ok: true, value: { kind: "help", help } };
  if (name === undefined) return parseFailure("add", "add requires exactly one report name.", help);
  return { ok: true, value: { kind: "add", name, starter, write: yesSeen } };
}

function parseInspect(argv: readonly string[], invocation: string): CommandParseResult {
  const help = commandHelp(invocation, "inspect");
  const allowed = new Set(["--artifact", "--full", "--help"]);
  const unknown = argv
    .slice(1)
    .find((argument) => argument.startsWith("-") && !allowed.has(argument));
  if (unknown)
    return parseFailure("inspect", `Unknown flag ${JSON.stringify(unknown)} for inspect.`, help);
  if (helpCount(argv) > 1)
    return parseFailure("inspect", "--help may be provided only once.", help);
  const fullCount = argv.filter((argument) => argument === "--full").length;
  if (fullCount > 1) return parseFailure("inspect", "--full may be provided only once.", help);
  const artifactIndexes = argv.flatMap((argument, index) =>
    argument === "--artifact" ? [index] : [],
  );
  if (artifactIndexes.length > 1)
    return parseFailure("inspect", "--artifact may be provided only once.", help);
  const artifactIndex = artifactIndexes[0];
  const artifact = artifactIndex === undefined ? undefined : argv[artifactIndex + 1];
  const artifactMissing = artifactIndex !== undefined && (!artifact || artifact.startsWith("-"));
  const consumed = new Set<number>([0]);
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--help" || argv[index] === "--full") consumed.add(index);
  }
  if (artifactIndex !== undefined) {
    consumed.add(artifactIndex);
    if (!artifactMissing) consumed.add(artifactIndex + 1);
  }
  const positionals = argv.filter((_, index) => !consumed.has(index));
  if (positionals.length > 1) {
    return parseFailure(
      "inspect",
      `Unexpected argument ${JSON.stringify(positionals[1])} for inspect.`,
      help,
    );
  }
  if (positionals.length === 1 && artifactIndex !== undefined) {
    return parseFailure(
      "inspect",
      "inspect accepts either one report name or --artifact, not both.",
      help,
    );
  }
  const report = positionals[0];
  if (report && !isReportName(report)) return invalidReportName("inspect", report, help);
  if (argv.includes("--help")) return { ok: true, value: { kind: "help", help } };
  if (artifactMissing) return parseFailure("inspect", "--artifact requires one HTML path.", help);
  if (artifact) {
    return {
      ok: true,
      value: {
        kind: "inspect",
        full: fullCount === 1,
        target: { kind: "artifact", path: artifact },
      },
    };
  }
  if (!report)
    return parseFailure("inspect", "inspect requires a report name or --artifact.", help);
  return {
    ok: true,
    value: { kind: "inspect", full: fullCount === 1, target: { kind: "report", report } },
  };
}

interface ScannedCommandArguments {
  readonly booleans: ReadonlySet<string>;
  readonly missing: ReadonlySet<string>;
  readonly positionals: readonly string[];
  readonly seen: ReadonlySet<string>;
  readonly values: ReadonlyMap<string, string>;
}

function scanCommandArguments(
  argv: readonly string[],
  command: CommandName,
  help: HelpResult,
  valueFlags: ReadonlySet<string>,
  booleanFlags: ReadonlySet<string>,
):
  | { readonly ok: true; readonly value: ScannedCommandArguments }
  | { readonly ok: false; readonly result: CommandParseResult } {
  const known = new Set([...valueFlags, ...booleanFlags]);
  const seen = new Set<string>();
  const missing = new Set<string>();
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  const positionals: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (known.has(argument)) {
      if (seen.has(argument)) {
        return {
          ok: false,
          result: parseFailure(command, `${argument} may be provided only once.`, help),
        };
      }
      seen.add(argument);
      if (booleanFlags.has(argument)) {
        booleans.add(argument);
        continue;
      }
      const value = argv[index + 1];
      if (value === undefined || known.has(value)) {
        missing.add(argument);
        continue;
      }
      values.set(argument, value);
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      return {
        ok: false,
        result: parseFailure(
          command,
          `Unknown flag ${JSON.stringify(argument)} for ${command}.`,
          help,
        ),
      };
    }
    positionals.push(argument);
  }
  return { ok: true, value: { booleans, missing, positionals, seen, values } };
}

function parsePageNumber(
  command: CommandName,
  value: string | undefined,
  help: HelpResult,
):
  | { readonly ok: true; readonly number?: number }
  | { readonly ok: false; result: CommandParseResult } {
  if (value === undefined) return { ok: true };
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    return {
      ok: false,
      result: parseFailure(
        command,
        `Invalid page number ${JSON.stringify(value)}; expected a positive one-based integer.`,
        help,
      ),
    };
  }
  return { ok: true, number: Number(value) };
}

function parsedHtmlSelector(
  command: CommandName,
  scanned: ScannedCommandArguments,
  help: HelpResult,
):
  | { readonly ok: true; readonly selector?: HtmlPageSelector }
  | { readonly ok: false; readonly result: CommandParseResult } {
  if (scanned.seen.has("--page-id") && scanned.seen.has("--page-number")) {
    return {
      ok: false,
      result: parseFailure(command, "Use either --page-id or --page-number, not both.", help),
    };
  }
  const pageId = scanned.values.get("--page-id");
  if (pageId !== undefined) {
    if (pageId.length === 0) {
      return {
        ok: false,
        result: parseFailure(command, "--page-id requires a non-empty page ID.", help),
      };
    }
    return { ok: true, selector: { kind: "page-id", id: pageId } };
  }
  const pageNumber = parsePageNumber(command, scanned.values.get("--page-number"), help);
  if (!pageNumber.ok) return pageNumber;
  return pageNumber.number === undefined
    ? { ok: true }
    : { ok: true, selector: { kind: "page-number", number: pageNumber.number } };
}

function firstMissing(scanned: ScannedCommandArguments): string | undefined {
  return [...scanned.missing][0];
}

function parseCaptureOrExport(
  argv: readonly string[],
  invocation: string,
  command: "capture" | "export",
): CommandParseResult {
  const help = commandHelp(invocation, command);
  const valueFlags = new Set([
    "--artifact",
    "--output",
    ...(command === "capture" ? ["--page-id", "--page-number"] : []),
  ]);
  const scanned = scanCommandArguments(
    argv,
    command,
    help,
    valueFlags,
    new Set(["--full", "--help"]),
  );
  if (!scanned.ok) return scanned.result;
  const args = scanned.value;
  if (args.positionals.length > 1) {
    return parseFailure(
      command,
      `Unexpected argument ${JSON.stringify(args.positionals[1])} for ${command}.`,
      help,
    );
  }
  if (args.positionals.length === 1 && (args.seen.has("--artifact") || args.seen.has("--output"))) {
    return parseFailure(
      command,
      `${command} accepts either one report name or explicit artifact flags, not both.`,
      help,
    );
  }
  const report = args.positionals[0];
  if (report && !isReportName(report)) return invalidReportName(command, report, help);
  const selector = command === "capture" ? parsedHtmlSelector(command, args, help) : undefined;
  if (selector && !selector.ok) return selector.result;
  const artifact = args.values.get("--artifact");
  const output = args.values.get("--output");
  if (command === "export" && artifact !== undefined && !artifact.toLowerCase().endsWith(".html")) {
    return parseFailure("export", "Standalone export input must use the .html extension.", help);
  }
  if (command === "export" && output !== undefined && !output.toLowerCase().endsWith(".pdf")) {
    return parseFailure("export", "Standalone export output must use the .pdf extension.", help);
  }
  if (args.booleans.has("--help")) return { ok: true, value: { kind: "help", help } };
  const missing = firstMissing(args);
  if (missing) return parseFailure(command, `${missing} requires one value.`, help);
  if (artifact || output) {
    if (!artifact || !output) {
      return parseFailure(command, `Explicit ${command} requires --artifact and --output.`, help);
    }
    if (command === "capture") {
      return {
        ok: true,
        value: {
          kind: "capture",
          full: args.booleans.has("--full"),
          ...(selector?.ok && selector.selector ? { selector: selector.selector } : {}),
          target: { kind: "artifact", path: artifact, output },
        },
      };
    }
    return {
      ok: true,
      value: {
        kind: "export",
        full: args.booleans.has("--full"),
        target: { kind: "artifact", path: artifact, output },
      },
    };
  }
  if (!report)
    return parseFailure(command, `${command} requires a report name or artifact flags.`, help);
  if (command === "capture") {
    return {
      ok: true,
      value: {
        kind: "capture",
        full: args.booleans.has("--full"),
        ...(selector?.ok && selector.selector ? { selector: selector.selector } : {}),
        target: { kind: "report", report },
      },
    };
  }
  return {
    ok: true,
    value: {
      kind: "export",
      full: args.booleans.has("--full"),
      target: { kind: "report", report },
    },
  };
}

function parseReview(argv: readonly string[], invocation: string): CommandParseResult {
  const help = commandHelp(invocation, "review");
  const scanned = scanCommandArguments(
    argv,
    "review",
    help,
    new Set(["--page-id", "--page-number"]),
    new Set(["--all", "--pdf", "--full", "--help"]),
  );
  if (!scanned.ok) return scanned.result;
  const args = scanned.value;
  if (args.positionals.length > 1) {
    return parseFailure(
      "review",
      `Unexpected argument ${JSON.stringify(args.positionals[1])} for review.`,
      help,
    );
  }
  const report = args.positionals[0];
  if (report && !isReportName(report)) return invalidReportName("review", report, help);
  const selector = parsedHtmlSelector("review", args, help);
  if (!selector.ok) return selector.result;
  if (args.booleans.has("--all") && report) {
    return parseFailure(
      "review",
      "review accepts either one report name or --all, not both.",
      help,
    );
  }
  if (
    args.booleans.has("--all") &&
    (args.seen.has("--page-id") || args.seen.has("--page-number"))
  ) {
    return parseFailure("review", "review --all does not accept a page selector.", help);
  }
  if (args.booleans.has("--help")) return { ok: true, value: { kind: "help", help } };
  const missing = firstMissing(args);
  if (missing) return parseFailure("review", `${missing} requires one value.`, help);
  const common = {
    kind: "review" as const,
    full: args.booleans.has("--full"),
    pdf: args.booleans.has("--pdf"),
  };
  if (args.booleans.has("--all")) {
    return { ok: true, value: { ...common, target: { kind: "all" } } };
  }
  if (!report) return parseFailure("review", "review requires one report name or --all.", help);
  return {
    ok: true,
    value: {
      ...common,
      target: {
        kind: "report",
        report,
        ...(selector.selector ? { selector: selector.selector } : {}),
      },
    },
  };
}

function parseInspectPdf(argv: readonly string[], invocation: string): CommandParseResult {
  const help = commandHelp(invocation, "inspect-pdf");
  const scanned = scanCommandArguments(
    argv,
    "inspect-pdf",
    help,
    new Set(["--artifact", "--output", "--page-number"]),
    new Set(["--help"]),
  );
  if (!scanned.ok) return scanned.result;
  const args = scanned.value;
  if (args.positionals.length > 1) {
    return parseFailure(
      "inspect-pdf",
      `Unexpected argument ${JSON.stringify(args.positionals[1])} for inspect-pdf.`,
      help,
    );
  }
  if (args.positionals.length === 1 && (args.seen.has("--artifact") || args.seen.has("--output"))) {
    return parseFailure(
      "inspect-pdf",
      "inspect-pdf accepts either one report name or explicit artifact flags, not both.",
      help,
    );
  }
  const report = args.positionals[0];
  if (report && !isReportName(report)) return invalidReportName("inspect-pdf", report, help);
  const pageNumber = parsePageNumber("inspect-pdf", args.values.get("--page-number"), help);
  if (!pageNumber.ok) return pageNumber.result;
  if (args.booleans.has("--help")) return { ok: true, value: { kind: "help", help } };
  const missing = firstMissing(args);
  if (missing) return parseFailure("inspect-pdf", `${missing} requires one value.`, help);
  const artifact = args.values.get("--artifact");
  const output = args.values.get("--output");
  if (artifact || output) {
    if (!artifact || !output) {
      return parseFailure(
        "inspect-pdf",
        "Explicit PDF inspection requires --artifact <pdf> and --output <directory>.",
        help,
      );
    }
    return {
      ok: true,
      value: {
        kind: "inspect-pdf",
        ...(pageNumber.number === undefined ? {} : { pageNumber: pageNumber.number }),
        target: { kind: "artifact", path: artifact, output },
      },
    };
  }
  if (!report) {
    return parseFailure(
      "inspect-pdf",
      "inspect-pdf requires a report name or artifact flags.",
      help,
    );
  }
  return {
    ok: true,
    value: {
      kind: "inspect-pdf",
      ...(pageNumber.number === undefined ? {} : { pageNumber: pageNumber.number }),
      target: { kind: "report", report },
    },
  };
}

export function parseCommand(argv: readonly string[], invocation: string): CommandParseResult {
  if (argv.length === 0) return { ok: true, value: { kind: "home" } };
  if (argv[0] === "--help") {
    const help = topHelp(invocation);
    if (argv.length > 1) {
      return parseFailure(
        "help",
        `Unexpected argument ${JSON.stringify(argv[1])} for --help.`,
        help,
      );
    }
    return { ok: true, value: { kind: "help", help } };
  }
  const rawCommand = argv[0] as string;
  if (!COMMAND_NAMES.has(rawCommand as CommandName)) {
    return parseFailure(
      "unknown",
      rawCommand.startsWith("-")
        ? `Unknown top-level flag ${JSON.stringify(rawCommand)}.`
        : `Unknown command ${JSON.stringify(rawCommand)}.`,
      topHelp(invocation),
    );
  }
  const command = rawCommand as Exclude<CommandName, "home" | "help" | "unknown">;
  if (command === "init") return parseInit(argv, invocation);
  if (command === "add") return parseAdd(argv, invocation);
  if (command === "inspect") return parseInspect(argv, invocation);
  if (command === "capture" || command === "export") {
    return parseCaptureOrExport(argv, invocation, command);
  }
  if (command === "inspect-pdf") return parseInspectPdf(argv, invocation);
  if (command === "review") return parseReview(argv, invocation);
  return parseSimpleReportCommand(argv, invocation, command);
}

export function parsedCommandName(command: ParsedCommand): CommandName {
  return command.kind === "help" ? "help" : command.kind;
}
