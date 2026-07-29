import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

function resolveAssetSource(source: string | URL): string {
  if (typeof source === "string") return resolve(source);
  if (source.protocol !== "file:") {
    throw new Error(`Local asset URLs must use the file: scheme: ${source.href}`);
  }

  try {
    return fileURLToPath(source);
  } catch (error) {
    throw new Error(
      `Cannot resolve local asset URL ${source.href}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Read report-owned text such as CSS without making it runtime-owned policy. */
export async function readTextAsset(source: string | URL): Promise<string> {
  const resolvedPath = resolveAssetSource(source);
  try {
    return await readFile(resolvedPath, "utf8");
  } catch (error) {
    throw new Error(
      `Cannot read local text asset ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Inline a local binary asset so the completed HTML has no file dependency. */
export async function inlineAsset(source: string | URL): Promise<string> {
  const resolvedPath = resolveAssetSource(source);
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
