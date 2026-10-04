"use client";

import { useState } from "react";
import Link from "next/link";
import { RichText } from "@/components/latex";
import { useStore } from "@/components/store";
import type { ChatThread } from "@/lib/types";

const SYSTEM_NOTE = "The tutor explains. It does not mark. Scores on this site come from the imported answer key.";

export default function TutorPage() {
  const { chats, settings, attempts, putChat } = useStore();
  const [threadId, setThreadId] = useState(chats[0]?.id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const thread = chats.find((item) => item.id === threadId) ?? null;
  const latest = attempts.find((attempt) => attempt.evaluation);

  const prompts = [
    latest?.evaluation?.insights[0] ? `Look at this result and be specific: ${latest.evaluation.insights[0].title}. ${latest.evaluation.insights[0].detail}` : "I have not submitted a scored paper yet. Tell me how to use a PDF2CBT ZIP without inventing a score.",
    "Explain the difference between a conceptual miss and a calculation miss on a JEE numerical, with one physics example.",
    "Give me a revision set of 5 follow-up prompts for my weakest subject, based only on what I paste next.",
  ];

  async function send(prompt = text) {
    const content = prompt.trim();
    if (!content) return;
    setBusy(true);
    setError("");
    const base: ChatThread = thread ?? { id: crypto.randomUUID(), title: content.slice(0, 48), messages: [], updatedAt: new Date().getTime() };
    const history = [...base.messages, { role: "user" as const, content, at: new Date().getTime() }];
    const optimistic = { ...base, messages: history, updatedAt: new Date().getTime() };
    await putChat(optimistic);
    setThreadId(optimistic.id);
    setText("");
    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.geminiApiKey,
          model: settings.geminiModel,
          history: history.slice(0, -1).map((message) => ({ role: message.role, content: message.content })),
          prompt: `${content}\n\nRemember: never invent or override an answer key. If I have not provided the official key, say so.`,
        }),
      });
      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !payload.text) throw new Error(payload.error || "Gemini did not answer.");
      await putChat({
        ...optimistic,
        messages: [...history, { role: "assistant", content: payload.text, at: new Date().getTime() }],
        updatedAt: new Date().getTime(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 lg:grid-cols-[260px_1fr]">
      <aside>
        <p className="font-note text-2xl text-[var(--indigo)]">Doubt desk</p>
        <h1 className="font-display text-4xl">AI Tutor</h1>
        <p className="mt-2 text-sm leading-6">{SYSTEM_NOTE}</p>
        <button className="mt-3 border-2 border-[var(--ink)] px-3 py-2 text-sm" onClick={() => { setThreadId(""); }}>New thread</button>
        <div className="mt-3 space-y-2">
          {chats.map((chat) => (
            <button key={chat.id} className="block w-full border border-[var(--ink)]/30 bg-white px-3 py-2 text-left text-sm" onClick={() => setThreadId(chat.id)}>{chat.title}</button>
          ))}
        </div>
        {!settings.geminiApiKey ? <Link href="/settings" className="mt-4 block text-sm underline">Add a Gemini key in Settings</Link> : null}
      </aside>
      <section className="manga-panel flex min-h-[70vh] flex-col p-4">
        <div className="flex-1 space-y-3">
          {(thread?.messages ?? []).map((message, index) => (
            <article key={index} className={message.role === "user" ? "ml-8 border-2 border-[var(--ink)] bg-white p-3" : "mr-8 bg-[#f6efe4] p-3"}>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{message.role === "user" ? "You" : "Tutor"}</p>
              <RichText text={message.content} />
            </article>
          ))}
          {!thread?.messages.length ? (
            <div className="space-y-2">
              {prompts.map((prompt) => (
                <button key={prompt} className="block w-full border border-dashed border-[var(--ink)] px-3 py-2 text-left text-sm" onClick={() => void send(prompt)}>{prompt}</button>
              ))}
            </div>
          ) : null}
          {error ? <p className="text-sm text-[var(--vermilion)]">{error}</p> : null}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <textarea className="min-h-20 flex-1 border-2 border-[var(--ink)] bg-white p-3" value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask a doubt. Paste the official answer if you want a check against it." />
          <button className="bg-[var(--ink)] px-4 text-white disabled:opacity-40" disabled={busy}>{busy ? "…" : "Send"}</button>
        </form>
      </section>
    </div>
  );
}
