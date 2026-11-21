"use client";

import JSZip from "jszip";
import { parseUpload } from "@/lib/pdf2cbt";
import { getImages } from "@/lib/storage";
import type { StoredTest } from "@/lib/types";

export interface OfflineExportResult {
  html: string;
  filename: string;
  stats: {
    questions: number;
    images: number;
  };
}

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Test";
}

function blobToBase64DataUri(blob: Blob, fallbackMime = "image/png"): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      if (res.startsWith("data:")) {
        resolve(res);
      } else {
        resolve(`data:${fallbackMime};base64,${res}`);
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read image blob."));
    reader.readAsDataURL(blob);
  });
}

async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load asset: ${res.status}`);
  }
  return await res.blob();
}

function guessMimeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

function extFromMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("svg")) return "svg";
  return "png";
}

/**
 * Packages a StoredTest and its referenced images into a valid ZIP Blob.
 */
export async function exportTestToZip(
  test: StoredTest,
  onProgress?: (step: string, pct: number) => void
): Promise<Blob> {
  onProgress?.("Collecting test configuration...", 10);
  const zip = new JSZip();
  zip.file("test.json", JSON.stringify(test, null, 2));

  const allImageIds = Array.from(
    new Set(test.questions.flatMap((q) => q.imageIds || []))
  );

  if (allImageIds.length > 0) {
    onProgress?.(`Collecting ${allImageIds.length} question images...`, 30);
    const urls = await getImages(allImageIds);
    const imgFolder = zip.folder("images");
    const manifest: Record<string, string> = {};

    let done = 0;
    for (const id of allImageIds) {
      const blob = urls.get(id);
      if (blob && imgFolder) {
        try {
          const ext = extFromMime(blob.type || "image/png");
          const filename = `${id}.${ext}`;
          imgFolder.file(filename, blob);
          manifest[id] = `images/${filename}`;
        } catch {
          // Skip missing image gracefully
        }
      }
      done += 1;
      onProgress?.(
        `Packaging images (${done}/${allImageIds.length})...`,
        30 + Math.round((done / allImageIds.length) * 30)
      );
    }
    zip.file("images-manifest.json", JSON.stringify(manifest, null, 2));
  }

  onProgress?.("Generating ZIP archive...", 65);
  return await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/**
 * Converts an exported IJEE ZIP (or PDF2CBT ZIP) into a single,
 * completely self-contained offline HTML file.
 */
export async function convertZipToOfflineHtml(
  zipBlob: Blob,
  onProgress?: (step: string, pct: number) => void,
  bundles?: { css: string; js: string }
): Promise<OfflineExportResult> {
  onProgress?.("Reading ZIP archive...", 70);
  const zip = await JSZip.loadAsync(zipBlob);

  let test: StoredTest;
  const images: Record<string, string> = {};

  const testJsonEntry = zip.file("test.json");
  if (testJsonEntry) {
    const rawJson = await testJsonEntry.async("string");
    test = JSON.parse(rawJson) as StoredTest;
    if (!test || !Array.isArray(test.questions)) {
      throw new Error("Invalid test.json inside ZIP.");
    }

    const manifestEntry = zip.file("images-manifest.json");
    const manifest: Record<string, string> = manifestEntry
      ? (JSON.parse(await manifestEntry.async("string")) as Record<string, string>)
      : {};

    onProgress?.("Embedding images as Base64...", 80);
    const entries = Object.entries(manifest);
    for (const [id, relPath] of entries) {
      const file = zip.file(relPath);
      if (file) {
        const bytes = await file.async("uint8array");
        const mime = guessMimeFromFilename(relPath);
        const blob = new Blob([bytes as BlobPart], { type: mime });
        images[id] = await blobToBase64DataUri(blob, mime);
      }
    }
  } else {
    onProgress?.("Parsing PDF2CBT ZIP...", 75);
    const file = new File([zipBlob], "paper.zip", { type: "application/zip" });
    const parsed = await parseUpload(file);
    if (parsed.kind !== "test") {
      throw new Error("ZIP does not contain a valid test paper.");
    }
    test = parsed.test;
    onProgress?.("Embedding images as Base64...", 80);
    for (const item of parsed.images) {
      images[item.id] = await blobToBase64DataUri(item.blob, item.blob.type || "image/png");
    }
  }

  onProgress?.("Loading offline CBT runtime...", 90);
  let cssText = bundles?.css ?? "";
  let jsText = bundles?.js ?? "";

  if (!cssText || !jsText) {
    const [cssRes, jsRes] = await Promise.all([
      fetch("/offline/offline-app.css"),
      fetch("/offline/offline-app.js"),
    ]);
    if (!cssRes.ok || !jsRes.ok) {
      throw new Error("Offline CBT bundle not found. Run build:offline first.");
    }
    cssText = await cssRes.text();
    jsText = await jsRes.text();
  }

  onProgress?.("Assembling standalone HTML...", 95);
  const safePayload = JSON.stringify({ test, images }).replace(/<\/script>/gi, "<\\/script>");
  const safeTitle = test.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>IJEE Offline CBT — ${safeTitle}</title>
  <style>${cssText}</style>
</head>
<body>
  <div id="root"></div>
  <script>window.__IJEE_OFFLINE_DATA__ = ${safePayload};</script>
  <script>${jsText}</script>
</body>
</html>`;

  onProgress?.("Done!", 100);
  return {
    html,
    filename: `IJEE_Offline_CBT_${sanitizeFilename(test.name)}.html`,
    stats: {
      questions: test.questions.length,
      images: Object.keys(images).length,
    },
  };
}

export function triggerDownload(content: string | Blob, filename: string, mime = "text/html;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
