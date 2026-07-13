import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Browser, Page, Request } from "playwright";
import { chromium } from "playwright";
import {
  formatArtifactIssues,
  validateArtifact,
  type ArtifactPage,
} from "./protocol.js";

interface ArtifactBrowserSession {
  page: Page;
  pages: ArtifactPage[];
}

function displayResource(url: string): string {
  if (!url.startsWith("file:")) return url;
  try {
    return fileURLToPath(url);
  } catch {
    return url;
  }
}

/**
 * Opens one canonical HTML artifact in the pinned browser and applies the
 * shared protocol readiness gate. Playwright stays behind this internal seam.
 */
export async function withLoadedArtifact<T>(
  input: string,
  operation: (session: ArtifactBrowserSession) => Promise<T>,
): Promise<T> {
  const inputPath = resolve(input);
  try {
    await access(inputPath);
  } catch (error) {
    throw new Error(
      `Cannot read HTML artifact ${inputPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let browser: Browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    throw new Error(
      `Cannot launch the canonical Chromium browser. Run "pnpm exec playwright install chromium" and retry. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const browserIssues: string[] = [];
  const pendingResources = new Set<Request>();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on("request", (request) => {
      if (request.resourceType() !== "document") pendingResources.add(request);
    });
    page.on("requestfinished", (request) => pendingResources.delete(request));
    page.on("console", (message) => {
      if (message.type() === "error") browserIssues.push(`Console error: ${message.text()}`);
    });
    page.on("pageerror", (error) => browserIssues.push(`Page error: ${error.message}`));
    page.on("requestfailed", (request) => {
      pendingResources.delete(request);
      browserIssues.push(
        `Resource failed: ${displayResource(request.url())} (${request.failure()?.errorText ?? "unknown error"})`,
      );
    });

    try {
      await page.goto(pathToFileURL(inputPath).href, { waitUntil: "domcontentloaded", timeout: 5_000 });
    } catch (error) {
      const pending = [...pendingResources].map((request) => displayResource(request.url()));
      throw new Error(
        `Cannot load HTML artifact ${inputPath}${pending.length === 0 ? "" : `. Pending resources: ${pending.join(", ")}`}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const validation = await page.evaluate(validateArtifact);
    const issues = [
      ...(validation.ok ? [] : [formatArtifactIssues(validation.issues)]),
      ...browserIssues,
      ...[...pendingResources].map((request) => `Resource still pending: ${displayResource(request.url())}`),
    ];
    if (issues.length > 0) {
      throw new Error(`Artifact readiness failed:\n${issues.join("\n")}`);
    }

    const result = await operation({ page, pages: validation.pages });
    const operationIssues = [
      ...browserIssues,
      ...[...pendingResources].map((request) => `Resource still pending: ${displayResource(request.url())}`),
    ];
    if (operationIssues.length > 0) {
      throw new Error(`Artifact browser errors:\n${operationIssues.join("\n")}`);
    }
    return result;
  } finally {
    await browser.close();
  }
}
