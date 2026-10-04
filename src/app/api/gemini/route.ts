import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYSTEM = `You are an expert JEE Main and JEE Advanced tutor specializing in Physics, Chemistry and Mathematics. Give rigorous but understandable solutions. Never invent an answer key. Treat the imported test data and deterministic evaluation engine as the source of truth. Clearly distinguish between conceptual errors, calculation errors and interpretation errors. Use proper mathematical notation and JEE-level reasoning.`;

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function POST(request: Request) {
  let body: {
    model?: string;
    prompt?: string;
    history?: { role: "user" | "assistant"; content: string }[];
    images?: { mimeType: string; data: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini is not configured for this deployment. The site operator must set GEMINI_API_KEY on the server." },
      { status: 503 },
    );
  }
  const prompt = (body.prompt ?? "").slice(0, 24000);
  if (!prompt.trim()) return NextResponse.json({ error: "Empty prompt." }, { status: 400 });

  const history = (body.history ?? []).slice(-8).map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content.slice(0, 8000) }],
  }));
  const parts: Part[] = [{ text: prompt }];
  for (const image of (body.images ?? []).slice(0, 3)) {
    if (image.data && image.mimeType) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }
  const contents = [...history, { role: "user", parts }];
  const models = body.model ? [body.model, ...MODELS.filter((model) => model !== body.model)] : MODELS;
  let lastError = "Gemini request failed.";

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } | null;
    if (!response.ok) {
      lastError = payload?.error?.message || `Gemini returned ${response.status} for ${model}.`;
      if (response.status === 404 || response.status === 400) continue;
      return NextResponse.json({ error: lastError }, { status: response.status });
    }
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
    if (!text) {
      lastError = "Gemini returned an empty explanation.";
      continue;
    }
    return NextResponse.json({ text, model });
  }
  return NextResponse.json({ error: lastError }, { status: 502 });
}
