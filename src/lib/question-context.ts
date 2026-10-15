// Client-side question-context extraction service.
//
// Captures the COMPLETE currently selected question — original-resolution
// images included — for the hybrid AI solver. Browser-only module: it reads
// image blobs from IndexedDB and creates object URLs. The pure assembly and
// prompt building live in jee-solver.ts so they stay unit-testable.

import {
  assembleQuestionContext,
  type QuestionContext,
  type QuestionImageAsset,
} from "./jee-solver";
import { getImages } from "./storage";
import type { Question, StoredTest } from "./types";

/** The built-in solver accepts at most this many inline images per request. */
export const MAX_SOLVE_IMAGES = 6;
/** Mirrors the server-side per-image base64 cap in lib/ai.ts. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export type CaptureQuestionContextInput = {
  test: Pick<StoredTest, "id" | "name" | "examType" | "kind">;
  question: Question;
  displayNumber?: number | null;
  /** Object URLs the page already created for these images (reused, not re-created). */
  existingUrls?: Record<string, string>;
  /** Verification workflow only. Never enabled from the exam room. */
  includeAnswerKey?: boolean;
  userAnswerLabel?: string | null;
  sectionInstruction?: string;
};

export type CapturedContext = {
  context: QuestionContext;
  /** Object URLs created by this capture and owned by the caller (revoke on dispose). */
  createdUrls: string[];
  /** Images that will actually be sent to the built-in AI (base64, size-capped). */
  sendableImages: { mimeType: string; data: string }[];
  /** Human-readable notes about anything that could NOT be included. */
  omissions: string[];
};

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

/**
 * Load every image of one question at its original resolution, in original
 * order. Missing blobs are flagged, never silently dropped.
 */
export async function loadQuestionImageAssets(
  imageIds: string[],
  existingUrls?: Record<string, string>,
): Promise<{ assets: QuestionImageAsset[]; createdUrls: string[]; blobs: Map<string, Blob> }> {
  const blobs = await getImages(imageIds);
  const assets: QuestionImageAsset[] = [];
  const createdUrls: string[] = [];
  imageIds.forEach((imageId, index) => {
    const blob = blobs.get(imageId);
    if (!blob) {
      assets.push({
        imageId,
        order: index + 1,
        role: index === 0 ? "question" : "figure",
        mimeType: "image/png",
        byteSize: 0,
        missing: true,
        ...(existingUrls?.[imageId] ? { objectUrl: existingUrls[imageId] } : {}),
        fileName: `question-image-${index + 1}.png`,
      });
      return;
    }
    let objectUrl = existingUrls?.[imageId];
    if (!objectUrl) {
      objectUrl = URL.createObjectURL(blob);
      createdUrls.push(objectUrl);
    }
    assets.push({
      imageId,
      order: index + 1,
      role: index === 0 ? "question" : "figure",
      mimeType: blob.type || "image/png",
      byteSize: blob.size,
      missing: false,
      objectUrl,
      fileName: `question-image-${index + 1}.${(blob.type || "image/png").includes("jpeg") ? "jpg" : (blob.type || "image/png").includes("webp") ? "webp" : "png"}`,
    });
  });
  return { assets, createdUrls, blobs };
}

/**
 * Capture the complete context for exactly one question. The captured value
 * is a snapshot: later navigation to other questions never mutates it.
 */
export async function captureQuestionContext(input: CaptureQuestionContextInput): Promise<CapturedContext> {
  const { assets, createdUrls, blobs } = await loadQuestionImageAssets(
    input.question.imageIds,
    input.existingUrls,
  );
  const context = assembleQuestionContext({
    test: input.test,
    question: input.question,
    displayNumber: input.displayNumber,
    images: assets,
    includeAnswerKey: input.includeAnswerKey,
    ...(input.userAnswerLabel != null ? { userAnswerLabel: input.userAnswerLabel } : {}),
    ...(input.sectionInstruction ? { sectionInstruction: input.sectionInstruction } : {}),
  });

  // Base64 payloads for the built-in vision model: original resolution,
  // capped per image and per request, with explicit omissions recorded.
  const sendableImages: { mimeType: string; data: string }[] = [];
  const omissions: string[] = [];
  for (const asset of assets) {
    if (asset.missing) {
      omissions.push(`image ${asset.order} of ${assets.length} is missing from this browser`);
      continue;
    }
    if (sendableImages.length >= MAX_SOLVE_IMAGES) {
      omissions.push(`only the first ${MAX_SOLVE_IMAGES} of ${assets.length} images fit one request`);
      break;
    }
    if (asset.byteSize > MAX_IMAGE_BYTES) {
      omissions.push(`image ${asset.order} is larger than the ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB per-image limit`);
      continue;
    }
    const blob = blobs.get(asset.imageId);
    if (!blob) {
      omissions.push(`image ${asset.order} could not be re-read from storage`);
      continue;
    }
    sendableImages.push({ mimeType: blob.type || "image/png", data: await blobToBase64(blob) });
  }

  return { context, createdUrls, sendableImages, omissions };
}
