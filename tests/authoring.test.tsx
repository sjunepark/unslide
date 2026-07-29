import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import React from "react";
import UnslideReact, { type ReportComponent, type ReportSource } from "../src/unslide/react.js";
import { buildReport } from "../src/unslide/build.js";
import type { ReportConfig } from "../src/unslide/config.js";
import { runUnslide } from "./runtime.js";

const repositoryRoot = resolve(".");

const typedComponent: ReportComponent = () => <html lang="en" />;
const typedElement: ReportSource = <html lang="en" />;
void [typedComponent, typedElement];

test("the public React entry uses the required consumer peer", async () => {
  assert.equal(UnslideReact, React);
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
  };
  assert.equal(manifest.peerDependencies.react, ">=19.1.0 <20");
  assert.equal(manifest.peerDependencies["react-dom"], ">=19.1.0 <20");
  assert.equal(manifest.dependencies.react, undefined);
  assert.equal(manifest.dependencies["react-dom"], undefined);
});

function reportConfig(directory: string, name: string): ReportConfig {
  return {
    name,
    sourcePath: resolve(directory, `${name}.tsx`),
    htmlPath: resolve(directory, `${name}.html`),
    pdfPath: resolve(directory, `${name}.pdf`),
    captureDirectory: resolve(directory, `${name}-captures`),
    pdfCaptureDirectory: resolve(directory, `${name}-pdf-captures`),
  };
}

async function buildSource(directory: string, name: string, source: string): Promise<string> {
  const report = reportConfig(directory, name);
  await writeFile(report.sourcePath, source);
  await runUnslide(buildReport(report));
  return readFile(report.htmlPath, "utf8");
}

test("build accepts created elements and materializes zero-prop components through React", async () => {
  await mkdir(resolve(repositoryRoot, ".tmp"), { recursive: true });
  const directory = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide-authoring-valid-"));
  try {
    const elementHtml = await buildSource(
      directory,
      "element",
      `import React from "react";
export default <html lang="en"><body><main data-unslide-page="element">Element</main></body></html>;
`,
    );
    assert.match(elementHtml, /data-unslide-page="element"/);

    const componentHtml = await buildSource(
      directory,
      "component",
      `import React, { useId } from "react";
export default function Report() {
  const id = useId();
  return <html lang="en"><body><main id={id} data-unslide-page="component">Component</main></body></html>;
}
`,
    );
    assert.match(componentHtml, /data-unslide-page="component"/);
    assert.match(componentHtml, /id="[^"]+"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("build rejects unsupported default export shapes with curated details", async () => {
  await mkdir(resolve(repositoryRoot, ".tmp"), { recursive: true });
  const directory = await mkdtemp(resolve(repositoryRoot, ".tmp", "unslide-authoring-invalid-"));
  const invalidSources = [
    {
      name: "missing",
      source: "export const report = true;\n",
      detail: /default export is missing/,
    },
    { name: "primitive", source: "export default 42;\n", detail: /unsupported number/ },
    {
      name: "promise",
      source: `import React from "react";
export default Promise.resolve(<html lang="en" />);
`,
      detail: /Promise exports are unsupported/,
    },
    {
      name: "class",
      source: `import React from "react";
export default class Report extends React.Component {
  render() { return <html lang="en" />; }
}
`,
      detail: /Class components are unsupported/,
    },
    {
      name: "memo",
      source: `import React from "react";
export default React.memo(function Report() { return <html lang="en" />; });
`,
      detail: /React memo exports are unsupported/,
    },
    {
      name: "lazy",
      source: `import React from "react";
export default React.lazy(async () => ({ default: function Report() { return <html lang="en" />; } }));
`,
      detail: /React lazy exports are unsupported/,
    },
    {
      name: "object",
      source: "export default { report: true };\n",
      detail: /unsupported object/,
    },
    {
      name: "async",
      source: `import React from "react";
export default async function Report() { return <html lang="en" />; }
`,
      detail: /Async components are unsupported/,
    },
    {
      name: "props",
      source: `import React from "react";
export default function Report({ title }: { title: string }) { return <html lang="en"><title>{title}</title></html>; }
`,
      detail: /declares required parameters/,
    },
  ] as const;

  try {
    for (const invalid of invalidSources) {
      await assert.rejects(buildSource(directory, invalid.name, invalid.source), (error: Error) => {
        assert.match(error.message, /must export one complete React document/);
        assert.match(error.message, invalid.detail);
        return true;
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
