import type { CliLogLevel } from "./logging.js";

export type OutputFormat = "toon" | "json";

export type CommandName =
  | "home"
  | "help"
  | "init"
  | "add"
  | "build"
  | "inspect"
  | "capture"
  | "export"
  | "inspect-pdf"
  | "unknown";

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
      readonly starter: "minimal" | "business-report";
      readonly write: boolean;
    }
  | {
      readonly kind: "add";
      readonly name: string;
      readonly starter: "minimal" | "business-report";
      readonly write: boolean;
    }
  | { readonly kind: "build"; readonly report: string }
  | {
      readonly kind: "inspect";
      readonly full: boolean;
      readonly target:
        | { readonly kind: "report"; readonly report: string }
        | { readonly kind: "artifact"; readonly path: string };
    }
  | { readonly kind: "capture"; readonly full: boolean; readonly report: string }
  | { readonly kind: "export"; readonly full: boolean; readonly report: string }
  | {
      readonly kind: "inspect-pdf";
      readonly target:
        | { readonly kind: "report"; readonly report: string }
        | {
            readonly kind: "artifact";
            readonly path: string;
            readonly output: string;
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
const OUTPUT_FORMATS = new Set<OutputFormat>(["toon", "json"]);
const LOG_LEVELS = new Set<CliLogLevel>(["off", "info", "debug"]);
const COMMAND_NAMES = new Set<CommandName>([
  "init",
  "add",
  "build",
  "inspect",
  "capture",
  "export",
  "inspect-pdf",
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
      { command: "build <name>", description: "Build a named report to standalone HTML" },
      { command: "inspect <name>", description: "Validate a named report HTML artifact" },
      { command: "inspect --artifact <html>", description: "Validate standalone HTML" },
      { command: "capture <name>", description: "Capture a named report HTML pages" },
      { command: "export <name>", description: "Export a named report HTML to PDF" },
      { command: "inspect-pdf <name>", description: "Render a named report PDF to images" },
      {
        command: "inspect-pdf --artifact <pdf> --output <directory>",
        description: "Render a standalone PDF to images",
      },
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
        helpFlag(),
        ...globals,
      ],
      examples: [
        `${invocation} inspect-pdf report`,
        `${invocation} inspect-pdf --artifact artifacts/report.pdf --output .tmp/pdf-captures/report`,
      ],
    };
  }
  const flags = [
    ...(command === "capture" || command === "export" ? [fullFlag()] : []),
    helpFlag(),
    ...globals,
  ];
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

function helpCount(argv: readonly string[]): number {
  return argv.filter((argument) => argument === "--help").length;
}

function parseSimpleReportCommand(
  argv: readonly string[],
  invocation: string,
  command: "build" | "capture" | "export",
): CommandParseResult {
  const help = commandHelp(invocation, command);
  const allowed = new Set(["--help", ...(command === "build" ? [] : ["--full"])]);
  const unknown = argv
    .slice(1)
    .find((argument) => argument.startsWith("-") && !allowed.has(argument));
  if (unknown)
    return parseFailure(command, `Unknown flag ${JSON.stringify(unknown)} for ${command}.`, help);
  if (helpCount(argv) > 1) return parseFailure(command, "--help may be provided only once.", help);
  const fullCount = argv.filter((argument) => argument === "--full").length;
  if (fullCount > 1) return parseFailure(command, "--full may be provided only once.", help);
  const positionals = argv
    .slice(1)
    .filter((argument) => argument !== "--help" && argument !== "--full");
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
  return {
    ok: true,
    value:
      command === "build"
        ? { kind: command, report }
        : { kind: command, report, full: fullCount === 1 },
  };
}

function parseInit(argv: readonly string[], invocation: string): CommandParseResult {
  const help = commandHelp(invocation, "init");
  let name = "report";
  let nameSeen = false;
  let yesSeen = false;
  let starter: "minimal" | "business-report" = "minimal";
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
      if (starterSeen) return parseFailure("init", "--starter may be provided only once.", help);
      starterSeen = true;
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return parseFailure("init", "--starter requires one value.", help);
      }
      if (value !== "minimal" && value !== "business-report") {
        return parseFailure(
          "init",
          `Invalid --starter value ${JSON.stringify(value)}; expected minimal, business-report.`,
          help,
        );
      }
      starter = value;
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
  let starter: "minimal" | "business-report" = "minimal";
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
      if (starterSeen) return parseFailure("add", "--starter may be provided only once.", help);
      starterSeen = true;
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return parseFailure("add", "--starter requires one value.", help);
      }
      if (value !== "minimal" && value !== "business-report") {
        return parseFailure(
          "add",
          `Invalid --starter value ${JSON.stringify(value)}; expected minimal, business-report.`,
          help,
        );
      }
      starter = value;
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

function parseInspectPdf(argv: readonly string[], invocation: string): CommandParseResult {
  const help = commandHelp(invocation, "inspect-pdf");
  const allowed = new Set(["--artifact", "--output", "--help"]);
  const unknown = argv
    .slice(1)
    .find((argument) => argument.startsWith("-") && !allowed.has(argument));
  if (unknown)
    return parseFailure(
      "inspect-pdf",
      `Unknown flag ${JSON.stringify(unknown)} for inspect-pdf.`,
      help,
    );
  if (helpCount(argv) > 1)
    return parseFailure("inspect-pdf", "--help may be provided only once.", help);

  const valueFlags = ["--artifact", "--output"] as const;
  const values = new Map<(typeof valueFlags)[number], string>();
  const seen = new Set<string>();
  const missing = new Set<string>();
  const consumed = new Set<number>([0]);
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--help") {
      consumed.add(index);
      continue;
    }
    if (argument === "--artifact" || argument === "--output") {
      if (seen.has(argument))
        return parseFailure("inspect-pdf", `${argument} may be provided only once.`, help);
      seen.add(argument);
      consumed.add(index);
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        missing.add(argument);
      } else {
        values.set(argument, value);
        consumed.add(index + 1);
        index += 1;
      }
    }
  }
  const positionals = argv.filter((_, index) => !consumed.has(index));
  if (positionals.length > 1) {
    return parseFailure(
      "inspect-pdf",
      `Unexpected argument ${JSON.stringify(positionals[1])} for inspect-pdf.`,
      help,
    );
  }
  if (positionals.length === 1 && seen.size > 0) {
    return parseFailure(
      "inspect-pdf",
      "inspect-pdf accepts either one report name or explicit artifact flags, not both.",
      help,
    );
  }
  const report = positionals[0];
  if (report && !isReportName(report)) return invalidReportName("inspect-pdf", report, help);
  if (argv.includes("--help")) return { ok: true, value: { kind: "help", help } };
  if (missing.size > 0) {
    const flag = [...missing][0] as string;
    return parseFailure("inspect-pdf", `${flag} requires one value.`, help);
  }
  const artifact = values.get("--artifact");
  const output = values.get("--output");
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
  return { ok: true, value: { kind: "inspect-pdf", target: { kind: "report", report } } };
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
  if (command === "inspect-pdf") return parseInspectPdf(argv, invocation);
  return parseSimpleReportCommand(argv, invocation, command);
}

export function parsedCommandName(command: ParsedCommand): CommandName {
  return command.kind === "help" ? "help" : command.kind;
}
