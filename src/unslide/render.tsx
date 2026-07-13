import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export interface WriteReportOptions {
  document: ReactElement;
  outputPath: string;
}

const mediaTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Read report-owned text such as CSS without making it runtime-owned policy. */
export async function readTextAsset(path: string): Promise<string> {
  const resolvedPath = resolve(path);
  try {
    return await readFile(resolvedPath, "utf8");
  } catch (error) {
    throw new Error(
      `Cannot read local text asset ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Inline a local binary asset so the completed HTML has no file dependency. */
export async function inlineAsset(path: string): Promise<string> {
  const resolvedPath = resolve(path);
  const mediaType = mediaTypes[extname(resolvedPath).toLowerCase()];

  if (!mediaType) {
    throw new Error(`Cannot inline unsupported local asset type: ${resolvedPath}`);
  }

  let contents: Buffer;
  try {
    contents = await readFile(resolvedPath);
  } catch (error) {
    throw new Error(
      `Cannot read local asset ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return `data:${mediaType};base64,${contents.toString("base64")}`;
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

export async function writeReportHtml({ document, outputPath }: WriteReportOptions): Promise<string> {
  const markup = renderToStaticMarkup(document);
  assertCompleteStandaloneDocument(markup);

  const html = `<!doctype html>\n${markup}\n`;
  const resolvedOutputPath = resolve(outputPath);
  const temporaryPath = `${resolvedOutputPath}.tmp-${process.pid}-${randomUUID()}`;

  await mkdir(dirname(resolvedOutputPath), { recursive: true });
  try {
    await writeFile(temporaryPath, html, { flag: "wx" });
    await rename(temporaryPath, resolvedOutputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  return resolvedOutputPath;
}
