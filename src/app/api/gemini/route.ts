import { NextRequest, NextResponse } from "next/server";
import { generateText, AiError } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: {
    model?: unknown;
    prompt?: unknown;
    history?: unknown;
    images?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "A non-empty prompt is required." }, { status: 400 });
  }

  const history = Array.isArray(body.history)
    ? body.history
        .slice(-8)
        .map((item) => {
          const record = item as { role?: unknown; content?: unknown };
          return {
            role: record?.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: typeof record?.content === "string" ? record.content : "",
          };
        })
        .filter((item) => item.content.trim().length > 0)
    : [];

  const images = Array.isArray(body.images)
    ? body.images
        .slice(0, 3)
        .map((item) => {
          const record = item as { mimeType?: unknown; data?: unknown };
          if (typeof record?.mimeType !== "string" || typeof record?.data !== "string") return null;
          return { mimeType: record.mimeType, data: record.data };
        })
        .filter((item): item is { mimeType: string; data: string } => item !== null)
    : [];

  try {
    const result = await generateText({
      prompt: body.prompt,
      history,
      images,
      model: typeof body.model === "string" ? body.model : undefined,
    });
    return NextResponse.json({ text: result.text, model: result.model });
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "AI request failed. Please try again." }, { status: 502 });
  }
}
