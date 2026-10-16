// Centralized, server-side AI service for IJEE.
// Provider and model configuration live here only. Keep this module server-side:
// never import it from client components.

export const AI_PROVIDER = "google-gemini" as const;
export const AI_MODEL = "gemini-2.5-flash";
export const AI_FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-flash-latest"] as const;
export const AI_ALLOWED_MODELS = [AI_MODEL, ...AI_FALLBACK_MODELS] as const;

export const AI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const AI_TIMEOUT_MS = 45_000;
export const AI_MAX_PROMPT_CHARS = 24_000;
export const AI_MAX_HISTORY_MESSAGES = 8;
export const AI_MAX_HISTORY_CHARS = 8_000;
export const AI_MAX_IMAGES = 3;
/** Hard ceiling for any single request, so a caller can never disable the cap. */
export const AI_ABSOLUTE_MAX_IMAGES = 8;
export const AI_MAX_IMAGE_BASE64_CHARS = 8 * 1024 * 1024;

export const AI_SYSTEM_PROMPT = `You are an expert JEE Main and JEE Advanced tutor specializing in Physics, Chemistry and Mathematics. Give rigorous but understandable solutions. Never invent an answer key. Treat the imported test data and deterministic evaluation engine as the source of truth. Clearly distinguish between conceptual errors, calculation errors and interpretation errors. Use proper mathematical notation and JEE-level reasoning.`;

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiImage {
  mimeType: string;
  data: string;
}

export interface AiGenerateInput {
  prompt: string;
  history?: AiMessage[];
  images?: AiImage[];
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
  /** Per-request inline-image cap. Defaults to AI_MAX_IMAGES; hard-capped at AI_ABSOLUTE_MAX_IMAGES. */
  maxImages?: number;
}

export interface AiGenerateResult {
  text: string;
  model: string;
}

export class AiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 500, code = "AI_ERROR") {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.code = code;
  }
}

export function getAiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim();
}

export function isAiConfigured(): boolean {
  return Boolean(getAiApiKey());
}

function sanitizeModel(model?: string): string {
  if (model && (AI_ALLOWED_MODELS as readonly string[]).includes(model)) {
    return model;
  }
  return AI_MODEL;
}

function buildContents(input: AiGenerateInput) {
  const prompt = (input.prompt ?? "").slice(0, AI_MAX_PROMPT_CHARS);
  if (!prompt.trim()) {
    throw new AiError("Empty prompt.", 400, "EMPTY_PROMPT");
  }

  const history = (input.history ?? [])
    .slice(-AI_MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: (message.content ?? "").slice(0, AI_MAX_HISTORY_CHARS) }],
    }));

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];

  const maxImages = Math.min(
    Math.max(1, input.maxImages ?? AI_MAX_IMAGES),
    AI_ABSOLUTE_MAX_IMAGES,
  );
  for (const image of (input.images ?? []).slice(0, maxImages)) {
    if (image?.data && image?.mimeType) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }
  }

  return { prompt, contents: [...history, { role: "user", parts }] };
}

export async function generateText(input: AiGenerateInput): Promise<AiGenerateResult> {
  const apiKey = getAiApiKey();
  if (!apiKey) {
    throw new AiError(
      "AI is not configured for this deployment. The site operator must set GEMINI_API_KEY on the server.",
      503,
      "NOT_CONFIGURED",
    );
  }

  const { contents } = buildContents(input);
  const systemPrompt = (input.systemPrompt ?? AI_SYSTEM_PROMPT).slice(0, AI_MAX_PROMPT_CHARS);
  const requestedModel = sanitizeModel(input.model);
  const models = [requestedModel, ...AI_FALLBACK_MODELS.filter((model) => model !== requestedModel)];

  let lastError = "AI request failed.";
  for (const model of models) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
      const response = await fetch(`${AI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: typeof input.temperature === "number" ? input.temperature : 0.4,
            maxOutputTokens: typeof input.maxOutputTokens === "number" ? input.maxOutputTokens : 4096,
          },
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: { message?: string; status?: string };
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          }
        | null;

      if (!response.ok) {
        lastError = payload?.error?.message || `AI provider returned ${response.status} for ${model}.`;
        if (response.status === 404 || response.status === 400) {
          continue;
        }
        throw new AiError(lastError, response.status >= 400 && response.status < 600 ? response.status : 502, "PROVIDER_ERROR");
      }

      const text = payload?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("\n")
        .trim();

      if (!text) {
        lastError = "AI provider returned an empty response.";
        continue;
      }

      return { text, model };
    } catch (error) {
      if (error instanceof AiError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new AiError("AI request timed out. Please try again.", 504, "TIMEOUT");
      }
      lastError = "Unable to reach the AI provider. Please try again.";
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new AiError(lastError, 502, "PROVIDER_ERROR");
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip markdown code fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // Try to find the first JSON object/array in the text.
    const start = candidate.search(/[{[]/);
    if (start >= 0) {
      const end = candidate.lastIndexOf(start === candidate.indexOf("{") ? "}" : "]");
      if (end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1));
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}

export async function generateJson<T>(
  input: AiGenerateInput,
  validate: (value: unknown) => value is T,
): Promise<{ data: T; text: string; model: string }> {
  const result = await generateText({
    ...input,
    prompt: `${input.prompt}\n\nRespond with valid JSON only. Do not include markdown or commentary.`,
  });
  const parsed = extractJson(result.text);
  if (!validate(parsed)) {
    throw new AiError("AI returned an invalid structured response.", 502, "INVALID_JSON");
  }
  return { data: parsed, text: result.text, model: result.model };
}
