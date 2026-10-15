import { NextRequest, NextResponse } from "next/server";
import {
  generateText,
  isAiConfigured,
  AI_PROVIDER,
  AI_MODEL,
  AI_MAX_PROMPT_CHARS,
  AI_MAX_HISTORY_MESSAGES,
  AI_MAX_HISTORY_CHARS,
  AI_MAX_IMAGES,
  AI_MAX_IMAGE_BASE64_CHARS,
  AiError,
} from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RequestBody = {
  prompt?: unknown;
  history?: unknown;
  images?: unknown;
  model?: unknown;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const buckets = new Map<string, number[]>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const entries = (buckets.get(ip) ?? []).filter((time) => time > cutoff);
  if (entries.length >= RATE_LIMIT_MAX) {
    const oldest = entries[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    buckets.set(ip, entries);
    return { allowed: false, retryAfter };
  }
  entries.push(now);
  buckets.set(ip, entries);
  // Opportunistic cleanup to avoid unbounded growth.
  if (buckets.size > 10_000) {
    for (const [key, value] of buckets) {
      const recent = value.filter((time) => time > cutoff);
      if (recent.length === 0) buckets.delete(key);
      else buckets.set(key, recent);
    }
  }
  return { allowed: true, retryAfter: 0 };
}

function validateImages(value: unknown): { mimeType: string; data: string }[] {
  if (!Array.isArray(value)) return [];
  const images: { mimeType: string; data: string }[] = [];
  for (const item of value.slice(0, AI_MAX_IMAGES)) {
    if (!item || typeof item !== "object") continue;
    const record = item as { mimeType?: unknown; data?: unknown };
    if (typeof record.mimeType !== "string" || typeof record.data !== "string") continue;
    if (!record.mimeType.startsWith("image/")) continue;
    if (record.data.length === 0 || record.data.length > AI_MAX_IMAGE_BASE64_CHARS) continue;
    images.push({ mimeType: record.mimeType, data: record.data });
  }
  return images;
}

function validateHistory(value: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(value)) return [];
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const item of value.slice(-AI_MAX_HISTORY_MESSAGES)) {
    if (!item || typeof item !== "object") continue;
    const record = item as { role?: unknown; content?: unknown };
    const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
    if (!role || typeof record.content !== "string") continue;
    history.push({ role, content: record.content.slice(0, AI_MAX_HISTORY_CHARS) });
  }
  return history;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: isAiConfigured(),
    provider: AI_PROVIDER,
    model: AI_MODEL,
  });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (typeof body?.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "A non-empty prompt is required." }, { status: 400 });
  }
  if (body.prompt.length > AI_MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `Prompt is too long. Maximum ${AI_MAX_PROMPT_CHARS} characters.` },
      { status: 413 },
    );
  }

  const history = validateHistory(body.history);
  const images = validateImages(body.images);
  const model = typeof body.model === "string" ? body.model : undefined;

  try {
    const result = await generateText({
      prompt: body.prompt,
      history,
      images,
      model,
    });
    return NextResponse.json({ text: result.text, model: result.model });
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "AI request failed. Please try again." }, { status: 502 });
  }
}
