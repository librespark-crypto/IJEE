import { NextRequest, NextResponse } from "next/server";
import {
  AI_ALLOWED_MODELS,
  AI_MAX_HISTORY_CHARS,
  AI_MAX_HISTORY_MESSAGES,
  AI_MAX_IMAGE_BASE64_CHARS,
  AI_MAX_PROMPT_CHARS,
  AI_MODEL,
  AI_PROVIDER,
  AiError,
  generateText,
  isAiConfigured,
} from "@/lib/ai";
import { JEE_SOLVER_SYSTEM_PROMPT } from "@/lib/jee-solver";

// Built-in IJEE AI solver (Mode A). The JEE system prompt is fixed
// server-side; the browser cannot override it or read server credentials.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Vision requests carry more payload than chat, so the burst limit is lower. */
const SOLVE_MAX_IMAGES = 6;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 15;
const buckets = new Map<string, number[]>();

type RequestBody = {
  prompt?: unknown;
  history?: unknown;
  images?: unknown;
  model?: unknown;
  questionId?: unknown;
};

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const entries = (buckets.get(ip) ?? []).filter((time) => time > cutoff);
  if (entries.length >= RATE_LIMIT_MAX) {
    const oldest = entries[0]!;
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    buckets.set(ip, entries);
    return { allowed: false, retryAfter };
  }
  entries.push(now);
  buckets.set(ip, entries);
  if (buckets.size > 10_000) {
    for (const [key, value] of buckets) {
      const recent = value.filter((time) => time > cutoff);
      if (recent.length === 0) buckets.delete(key);
      else buckets.set(key, recent);
    }
  }
  return { allowed: true, retryAfter: 0 };
}

function validateImages(value: unknown): { images: { mimeType: string; data: string }[]; rejected: number } {
  if (!Array.isArray(value)) return { images: [], rejected: 0 };
  const images: { mimeType: string; data: string }[] = [];
  let rejected = 0;
  for (const item of value.slice(0, SOLVE_MAX_IMAGES + 4)) {
    if (!item || typeof item !== "object") continue;
    const record = item as { mimeType?: unknown; data?: unknown };
    if (typeof record.mimeType !== "string" || typeof record.data !== "string") continue;
    if (!record.mimeType.startsWith("image/")) continue;
    if (record.data.length === 0 || record.data.length > AI_MAX_IMAGE_BASE64_CHARS) {
      rejected += 1;
      continue;
    }
    if (images.length >= SOLVE_MAX_IMAGES) {
      rejected += 1;
      continue;
    }
    images.push({ mimeType: record.mimeType, data: record.data });
  }
  return { images, rejected };
}

function validateHistory(value: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(value)) return [];
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const item of value.slice(-AI_MAX_HISTORY_MESSAGES)) {
    if (!item || typeof item !== "object") continue;
    const record = item as { role?: unknown; content?: unknown };
    const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
    if (!role || typeof record.content !== "string" || !record.content.trim()) continue;
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
    maxImages: SOLVE_MAX_IMAGES,
    systemPrompt: "JEE_SOLVER_SYSTEM_PROMPT",
  });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many solve requests. Please wait a moment and try again." },
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
    return NextResponse.json({ error: "A non-empty question prompt is required." }, { status: 400 });
  }
  if (body.prompt.length > AI_MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `Question prompt is too long. Maximum ${AI_MAX_PROMPT_CHARS} characters.` },
      { status: 413 },
    );
  }

  const model = typeof body.model === "string" && (AI_ALLOWED_MODELS as readonly string[]).includes(body.model)
    ? body.model
    : undefined;
  const history = validateHistory(body.history);
  const { images, rejected } = validateImages(body.images);
  const questionId = typeof body.questionId === "string" ? body.questionId.slice(0, 200) : undefined;

  try {
    const result = await generateText({
      prompt: body.prompt,
      history,
      images,
      model,
      systemPrompt: JEE_SOLVER_SYSTEM_PROMPT,
      maxImages: SOLVE_MAX_IMAGES,
      maxOutputTokens: 4096,
      temperature: 0.3,
    });
    return NextResponse.json({
      text: result.text,
      model: result.model,
      imagesSent: images.length,
      ...(rejected > 0 ? { imagesRejected: rejected } : {}),
      ...(questionId ? { questionId } : {}),
    });
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "The solver request failed. Please try again." }, { status: 502 });
  }
}
