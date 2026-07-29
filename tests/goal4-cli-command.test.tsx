import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand } from "../src/unslide/cli-command.js";

const invocation = "unslide";

function parsed(argv: readonly string[]) {
  const result = parseCommand(argv, invocation);
  assert.equal(result.ok, true, result.ok ? undefined : result.message);
  return result.ok ? result.value : assert.fail("command did not parse");
}

function rejected(argv: readonly string[]) {
  const result = parseCommand(argv, invocation);
  assert.equal(result.ok, false);
  return result.ok ? assert.fail("command unexpectedly parsed") : result;
}

test("Goal 4 command grammar models report, artifact, selector, and review targets", () => {
  assert.deepEqual(parsed(["report", "board-review"]), {
    kind: "report",
    report: "board-review",
  });
  assert.deepEqual(parsed(["capture", "board-review", "--page-id", "2"]), {
    kind: "capture",
    full: false,
    selector: { kind: "page-id", id: "2" },
    target: { kind: "report", report: "board-review" },
  });
  assert.deepEqual(
    parsed([
      "capture",
      "--artifact",
      "report.html",
      "--output",
      "captures",
      "--page-number",
      "2",
      "--full",
    ]),
    {
      kind: "capture",
      full: true,
      selector: { kind: "page-number", number: 2 },
      target: { kind: "artifact", path: "report.html", output: "captures" },
    },
  );
  assert.deepEqual(parsed(["export", "--artifact", "report.html", "--output", "report.pdf"]), {
    kind: "export",
    full: false,
    target: { kind: "artifact", path: "report.html", output: "report.pdf" },
  });
  assert.deepEqual(parsed(["inspect-pdf", "board-review", "--page-number", "3"]), {
    kind: "inspect-pdf",
    pageNumber: 3,
    target: { kind: "report", report: "board-review" },
  });
  assert.deepEqual(parsed(["review", "board-review", "--page-id", "summary", "--pdf"]), {
    kind: "review",
    full: false,
    pdf: true,
    target: {
      kind: "report",
      report: "board-review",
      selector: { kind: "page-id", id: "summary" },
    },
  });
  assert.deepEqual(parsed(["review", "--all", "--pdf", "--full"]), {
    kind: "review",
    full: true,
    pdf: true,
    target: { kind: "all" },
  });
});

test("Goal 4 command grammar rejects ambiguous targets and unsafe selectors", () => {
  for (const argv of [
    ["capture", "report", "--artifact", "report.html", "--output", "captures"],
    ["capture", "--artifact", "report.html"],
    ["export", "--output", "report.pdf"],
    ["export", "--artifact", "report.txt", "--output", "report.pdf"],
    ["export", "--artifact", "report.html", "--output", "report.txt"],
    ["capture", "report", "--page-id", "one", "--page-number", "1"],
    ["capture", "report", "--page-number", "0"],
    ["capture", "report", "--page-number", "1.5"],
    ["capture", "report", "--page-number", "9007199254740992"],
    ["review", "report", "--all"],
    ["review", "--all", "--page-number", "1"],
    ["review", "report", "--pdf", "--pdf"],
    ["inspect-pdf", "report", "--page-id", "cover"],
  ]) {
    assert.equal(rejected(argv).command, argv[0]);
  }
});

test("Goal 4 command help bypasses only missing required values", () => {
  assert.equal(parsed(["report", "--help"]).kind, "help");
  assert.equal(parsed(["capture", "--artifact", "--help"]).kind, "help");
  assert.equal(parsed(["review", "--help"]).kind, "help");
  assert.equal(rejected(["review", "--all", "--page-number", "1", "--help"]).command, "review");
  assert.equal(rejected(["review", "--all", "--page-number", "--help"]).command, "review");
  assert.equal(rejected(["capture", "report", "--wat", "--help"]).command, "capture");
});
