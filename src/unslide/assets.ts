import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

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
