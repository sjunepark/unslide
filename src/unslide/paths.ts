import { realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

function isNodeError(error: unknown): error is Error & { readonly code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

export function pathsOverlap(first: string, second: string): boolean {
  const firstToSecond = relative(first, second);
  const secondToFirst = relative(second, first);
  return (
    firstToSecond === "" ||
    (!firstToSecond.startsWith(`..${sep}`) && firstToSecond !== "..") ||
    (!secondToFirst.startsWith(`..${sep}`) && secondToFirst !== "..")
  );
}

/** Resolves symlinks in the nearest existing ancestor while preserving a missing suffix. */
export async function canonicalizeThroughExistingAncestor(inputPath: string): Promise<string> {
  let existingAncestor = resolve(inputPath);
  while (true) {
    try {
      const canonicalAncestor = await realpath(existingAncestor);
      return resolve(canonicalAncestor, relative(existingAncestor, inputPath));
    } catch (cause) {
      if (!isNodeError(cause) || (cause.code !== "ENOENT" && cause.code !== "ENOTDIR")) throw cause;
      const parent = dirname(existingAncestor);
      if (parent === existingAncestor) throw cause;
      existingAncestor = parent;
    }
  }
}
