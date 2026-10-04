"use client";

import type { CropJob } from "./types";

/**
 * Crops question images from questions.pdf using PDF2CBT coordinates.
 * Those coordinates are page points with a top-left origin. The official
 * pre-generated PNGs are exactly (x2-x1)*2 by (y2-y1)*2, so scale 2 matches.
 */
export async function cropPdfImages(
  pdfBytes: Uint8Array,
  jobs: CropJob[],
  onProgress?: (done: number, total: number, label: string) => void,
) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const copy = pdfBytes.slice();
  const doc = await pdfjs.getDocument({ data: copy }).promise;
  const byPage = new Map<number, CropJob[]>();
  for (const job of jobs) {
    const list = byPage.get(job.page) ?? [];
    list.push(job);
    byPage.set(job.page, list);
  }
  const blobs = new Map<string, Blob>();
  const errors: string[] = [];
  let done = 0;
  const scale = 2;

  for (const [pageNum, pageJobs] of byPage) {
    if (pageNum < 1 || pageNum > doc.numPages) {
      for (const job of pageJobs) errors.push(`${job.label}: page ${pageNum} is outside the PDF.`);
      done += pageJobs.length;
      onProgress?.(done, jobs.length, `Skipped page ${pageNum}`);
      continue;
    }
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    await page.render({ canvas, viewport }).promise;
    for (const job of pageJobs) {
      try {
        const x = Math.min(job.x1, job.x2) * scale;
        const y = Math.min(job.y1, job.y2) * scale;
        const w = Math.abs(job.x2 - job.x1) * scale;
        const h = Math.abs(job.y2 - job.y1) * scale;
        const sx = clamp(Math.floor(x), 0, canvas.width - 1);
        const sy = clamp(Math.floor(y), 0, canvas.height - 1);
        const sw = clamp(Math.ceil(w), 1, canvas.width - sx);
        const sh = clamp(Math.ceil(h), 1, canvas.height - sy);
        const out = document.createElement("canvas");
        out.width = sw;
        out.height = sh;
        const ctx = out.getContext("2d");
        if (!ctx) throw new Error("Canvas is unavailable in this browser.");
        ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        const blob = await new Promise<Blob>((resolve, reject) => {
          out.toBlob((value) => (value ? resolve(value) : reject(new Error("Could not encode a question image."))), "image/png");
        });
        blobs.set(job.imageId, blob);
      } catch (error) {
        errors.push(`${job.label}: ${error instanceof Error ? error.message : "crop failed"}`);
      }
      done += 1;
      onProgress?.(done, jobs.length, job.label);
    }
    page.cleanup();
    canvas.width = 1;
    canvas.height = 1;
  }
  const closable = doc as { destroy?: () => Promise<void> | void; cleanup?: () => void };
  await closable.destroy?.();
  closable.cleanup?.();
  return { blobs, errors };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
