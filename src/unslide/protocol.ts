// validateArtifact is serialized into the browser and cannot close over these
// module bindings. Keep its protocol literals synchronized with these exports.
export const UNSLIDE_PROTOCOL_VERSION = 1;
export const PROTOCOL_META_NAME = "unslide-protocol";
export const PAGE_MARKER_ATTRIBUTE = "data-unslide-page";
export const PAGE_MARKER_SELECTOR = `[${PAGE_MARKER_ATTRIBUTE}]`;

export interface ArtifactPage {
  id: string;
  index: number;
  tagName: string;
}

export interface ArtifactValidationIssue {
  code:
    | "document-readiness"
    | "protocol-version"
    | "missing-pages"
    | "empty-page-id"
    | "duplicate-page-id"
    | "font-readiness"
    | "image-readiness";
  message: string;
  pageId?: string;
  resource?: string;
  source: "protocol";
}

export interface ArtifactDiagnostic {
  code: string;
  message: string;
  pageId?: string;
  resource?: string;
  source: "browser" | "pdf" | "protocol";
}

export type ArtifactValidationResult =
  | { ok: true; pages: ArtifactPage[] }
  | { ok: false; pages: ArtifactPage[]; issues: ArtifactValidationIssue[] };

/**
 * Validates protocol v1 in the loaded document and waits for static visual
 * resources. Keep this function self-contained so Playwright can evaluate it
 * directly in the artifact without coupling the protocol to an authoring tool.
 */
export async function validateArtifact(): Promise<ArtifactValidationResult> {
  // Browser-evaluated copies of the exported protocol constants above.
  const markerAttribute = "data-unslide-page";
  const markerSelector = `[${markerAttribute}]`;
  const resourceTimeoutMs = 5_000;
  const issues: ArtifactValidationIssue[] = [];
  const fontReadinessPromise = Promise.race([
    document.fonts.ready.then(() => "ready" as const),
    new Promise<"timeout">((resolve) => {
      window.setTimeout(() => resolve("timeout"), resourceTimeoutMs);
    }),
  ]);

  // This selector and the supported version are browser copies of
  // PROTOCOL_META_NAME and UNSLIDE_PROTOCOL_VERSION; update both locations.
  const protocolMetadata = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="unslide-protocol"]'));
  if (protocolMetadata.length > 1) {
    issues.push({
      code: "protocol-version",
      message: "Artifact declares the Unslide protocol version more than once; keep exactly one version metadata element.",
      source: "protocol",
    });
  } else if (protocolMetadata.length === 1) {
    const version = protocolMetadata[0]?.content.trim() ?? "";
    if (version !== "1") {
      issues.push({
        code: "protocol-version",
        message: `Unsupported artifact protocol version "${version}". This release supports version 1; regenerate or migrate the report source manually because automatic migration is not available.`,
        source: "protocol",
      });
    }
  }

  if (document.readyState !== "complete") {
    const documentReadiness = await Promise.race([
      new Promise<"loaded">((resolve) => window.addEventListener("load", () => resolve("loaded"), { once: true })),
      new Promise<"timeout">((resolve) => window.setTimeout(() => resolve("timeout"), resourceTimeoutMs)),
    ]);
    if (documentReadiness === "timeout") {
      issues.push({
        code: "document-readiness",
        message: `Document did not finish loading within ${resourceTimeoutMs}ms.`,
        source: "protocol",
      });
    }
  }

  const pageElements = Array.from(document.querySelectorAll<HTMLElement>(markerSelector));
  const pages: ArtifactPage[] = [];
  const positionsById = new Map<string, number[]>();

  if (pageElements.length === 0) {
    issues.push({
      code: "missing-pages",
      message: `No report pages found. Expected at least one element with ${markerAttribute}=\"<id>\".`,
      source: "protocol",
    });
  }

  pageElements.forEach((element, index) => {
    const id = element.getAttribute(markerAttribute) ?? "";
    pages.push({ id, index, tagName: element.tagName.toLowerCase() });

    if (id.length === 0) {
      issues.push({
        code: "empty-page-id",
        message: `Page ${index + 1} has an empty ${markerAttribute} value.`,
        source: "protocol",
      });
      return;
    }

    const positions = positionsById.get(id) ?? [];
    positions.push(index + 1);
    positionsById.set(id, positions);
  });

  for (const [id, positions] of positionsById) {
    if (positions.length > 1) {
      issues.push({
        code: "duplicate-page-id",
        message: `Page ID \"${id}\" is duplicated at positions ${positions.join(", ")}.`,
        pageId: id,
        source: "protocol",
      });
    }
  }

  try {
    const fontReadiness = await fontReadinessPromise;

    if (fontReadiness === "timeout") {
      const resource = Array.from(document.fonts)
        .filter((font) => font.status === "loading")
        .map((font) => `${font.family} (${font.style} ${font.weight})`)
        .join(", ") || undefined;
      issues.push({
        code: "font-readiness",
        message: `Fonts did not finish loading within ${resourceTimeoutMs}ms.`,
        resource,
        source: "protocol",
      });
    }

    for (const font of document.fonts) {
      if (font.status === "error") {
        const resource = `${font.family} (${font.style} ${font.weight})`;
        issues.push({
          code: "font-readiness",
          message: "Font failed to load.",
          resource,
          source: "protocol",
        });
      }
    }
  } catch {
    issues.push({
      code: "font-readiness",
      message: "Document fonts failed to become ready.",
      source: "protocol",
    });
  }

  const imageIssues = await Promise.all(
    Array.from(document.images).map(async (image): Promise<ArtifactValidationIssue | undefined> => {
      const markedPage = image.closest<HTMLElement>(markerSelector);
      const pageId = markedPage?.getAttribute(markerAttribute) || undefined;
      const resource = image.currentSrc || image.getAttribute("src") || "<img without src>";

      if (!image.complete) {
        const loadState = await new Promise<"loaded" | "failed" | "timeout">((resolve) => {
          image.addEventListener("load", () => resolve("loaded"), { once: true });
          image.addEventListener("error", () => resolve("failed"), { once: true });
          window.setTimeout(() => resolve("timeout"), resourceTimeoutMs);

          if (image.complete) {
            resolve(image.naturalWidth > 0 ? "loaded" : "failed");
          }
        });

        if (loadState !== "loaded") {
          return {
            code: "image-readiness",
            message: loadState === "timeout"
              ? `Image did not finish loading within ${resourceTimeoutMs}ms${pageId ? ` on page \"${pageId}\"` : ""}.`
              : `Image failed to load${pageId ? ` on page \"${pageId}\"` : ""}.`,
            pageId,
            resource,
            source: "protocol",
          };
        }
      }

      if (image.naturalWidth === 0) {
        return {
          code: "image-readiness",
          message: `Image has no decodable content${pageId ? ` on page \"${pageId}\"` : ""}.`,
          pageId,
          resource,
          source: "protocol",
        };
      }

      try {
        const decodeState = await Promise.race([
          image.decode().then(() => "decoded" as const),
          new Promise<"timeout">((resolve) => {
            window.setTimeout(() => resolve("timeout"), resourceTimeoutMs);
          }),
        ]);

        if (decodeState === "timeout") {
          return {
            code: "image-readiness",
            message: `Image did not decode within ${resourceTimeoutMs}ms${pageId ? ` on page \"${pageId}\"` : ""}.`,
            pageId,
            resource,
            source: "protocol",
          };
        }
      } catch {
        return {
          code: "image-readiness",
          message: `Image failed to decode${pageId ? ` on page \"${pageId}\"` : ""}.`,
          pageId,
          resource,
          source: "protocol",
        };
      }

      return undefined;
    }),
  );

  issues.push(...imageIssues.filter((issue): issue is ArtifactValidationIssue => issue !== undefined));

  return issues.length === 0 ? { ok: true, pages } : { ok: false, pages, issues };
}
