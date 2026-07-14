import { randomUUID } from "node:crypto";
import { Effect, FileSystem, Path } from "effect";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { commandFailure, mapCommandFailure } from "./failures.js";
import { scoped } from "./lifecycle.js";
import { logDebug, withLogPhase } from "./logging.js";

export interface WriteReportOptions {
  document: ReactElement;
  outputPath: string;
}

function assertCompleteStandaloneDocument(html: string): void {
  if (!/^<html(?:\s|>)/i.test(html)) {
    throw new Error("Report document must render a complete <html> element.");
  }

  const dependencies = new Set<string>();
  const collectDependency = (value: string) => {
    const decoded = value.trim().replaceAll("&amp;", "&");
    if (decoded && !decoded.startsWith("data:") && !decoded.startsWith("#")) {
      dependencies.add(decoded);
    }
  };

  const collectSrcsetDependencies = (value: string) => {
    let position = 0;
    while (position < value.length) {
      while (position < value.length && /[\s,]/.test(value[position] ?? "")) position += 1;
      if (position >= value.length) break;

      const start = position;
      if (value.slice(position, position + 5).toLowerCase() === "data:") {
        const dataSeparator = value.indexOf(",", position + 5);
        position = dataSeparator === -1 ? value.length : dataSeparator + 1;
      }
      while (position < value.length && !/[\s,]/.test(value[position] ?? "")) position += 1;
      collectDependency(value.slice(start, position));

      let parentheses = 0;
      while (position < value.length) {
        const character = value[position];
        if (character === "(") parentheses += 1;
        if (character === ")") parentheses = Math.max(0, parentheses - 1);
        position += 1;
        if (character === "," && parentheses === 0) break;
      }
    }
  };

  for (const match of html.matchAll(
    /<(?:img|source|video|audio|track|script|iframe|embed|input)\b[^>]*\b(?:src|poster)=(?:"([^"]*)"|'([^']*)')/gi,
  )) {
    collectDependency(match[1] ?? match[2] ?? "");
  }

  for (const match of html.matchAll(/<object\b[^>]*\bdata=(?:"([^"]*)"|'([^']*)')/gi)) {
    collectDependency(match[1] ?? match[2] ?? "");
  }

  for (const match of html.matchAll(/<(?:image|use|feImage)\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)')/gi)) {
    collectDependency(match[1] ?? match[2] ?? "");
  }

  for (const match of html.matchAll(/<link\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)')/gi)) {
    collectDependency(match[1] ?? match[2] ?? "");
  }

  for (const match of html.matchAll(/\b(?:srcset)=(?:"([^"]*)"|'([^']*)')/gi)) {
    collectSrcsetDependencies(match[1] ?? match[2] ?? "");
  }

  const cssContexts = [
    ...Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi), (match) => match[1] ?? ""),
    ...Array.from(html.matchAll(/\sstyle=(?:"([^"]*)"|'([^']*)')/gi), (match) => match[1] ?? match[2] ?? ""),
  ];

  for (const css of cssContexts) {
    for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi)) {
      collectDependency(match[1] ?? match[2] ?? match[3] ?? "");
    }

    for (const match of css.matchAll(/@import\s+(?:url\()?\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      collectDependency(match[1] ?? match[2] ?? "");
    }

    for (const imageSet of css.matchAll(/(?:-webkit-)?image-set\((?:[^()]|\([^()]*\))*\)/gi)) {
      const candidates = imageSet[0].slice(imageSet[0].indexOf("(") + 1, -1);
      for (const candidate of candidates.matchAll(/(?:^|,)\s*(?:"([^"]*)"|'([^']*)')/g)) {
        collectDependency(candidate[1] ?? candidate[2] ?? "");
      }
    }
  }

  if (dependencies.size > 0) {
    throw new Error(
      `Standalone report contains unresolved resource dependencies:\n${[...dependencies].map((value) => `- ${value}`).join("\n")}`,
    );
  }
}

export const writeReportHtml = Effect.fn("render.writeReportHtml")(function* (
  { document, outputPath }: WriteReportOptions,
) {
  const context = { command: "build", path: outputPath } as const;
  const html = yield* withLogPhase(
    Effect.try({
      try: () => {
        const markup = renderToStaticMarkup(document);
        assertCompleteStandaloneDocument(markup);
        return `<!doctype html>\n${markup}\n`;
      },
      catch: (cause) => commandFailure(cause, context),
    }),
    "html.render",
    { path: outputPath },
  );
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const resolvedOutputPath = path.resolve(outputPath);
  const temporaryPath = `${resolvedOutputPath}.tmp-${process.pid}-${randomUUID()}`;

  const published = yield* withLogPhase(
    mapCommandFailure(scoped(Effect.gen(function* () {
      yield* fs.makeDirectory(path.dirname(resolvedOutputPath), { recursive: true });
      const temporary = yield* Effect.acquireRelease(
        Effect.succeed({ cleanup: true, path: temporaryPath }),
        (state) => state.cleanup
          ? fs.remove(state.path, { force: true }).pipe(Effect.orDie)
          : Effect.void,
      );
      yield* fs.writeFileString(temporary.path, html, { flag: "wx" });
      yield* fs.rename(temporary.path, resolvedOutputPath);
      temporary.cleanup = false;
      return resolvedOutputPath;
    })), context),
    "html.publish",
    { path: resolvedOutputPath },
  );
  yield* logDebug("artifact.published", { bytes: Buffer.byteLength(html), path: resolvedOutputPath });
  return published;
});
