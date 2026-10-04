"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpToLine, Copy, RotateCcw } from "lucide-react";
import { RichText } from "@/components/latex";
import { useStore } from "@/components/store";
import type { ChatMessage, ChatThread } from "@/lib/types";

const SYSTEM_NOTE = "The tutor explains. It does not mark. Scores on this site come from the imported answer key.";
const REMINDER = "Remember: never invent or override an answer key. If I have not provided the official key, say so.";

export default function TutorPage() {
  const { chats, settings, attempts, putChat } = useStore();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const activeThreadId = threadId ?? chats[0]?.id ?? "";
  const thread = chats.find((item) => item.id === activeThreadId) ?? null;
  const latest = attempts.find((attempt) => attempt.evaluation);
  const transcriptTopRef = useRef<HTMLDivElement>(null);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  const prompts = [
    latest?.evaluation?.insights[0]
      ? `Look at this result and be specific: ${latest.evaluation.insights[0].title}. ${latest.evaluation.insights[0].detail}`
      : "I have not submitted a scored paper yet. Tell me how to use a PDF2CBT ZIP without inventing a score.",
    "Explain the difference between a conceptual miss and a calculation miss on a JEE numerical, with one physics example.",
    "Give me a revision set of 5 follow-up prompts for my weakest subject, based only on what I paste next.",
  ];

  async function askTutor(prompt: string, history: ChatMessage[]) {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.geminiModel,
        history: history.slice(-8).map((message) => ({ role: message.role, content: message.content })),
        prompt: `${prompt}\n\n${REMINDER}`,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
    if (!response.ok || !payload?.text) {
      throw new Error(payload?.error || "The tutor could not return an explanation.");
    }
    return payload.text;
  }

  async function send(prompt = text) {
    const content = prompt.trim();
    if (!content || busy) return;

    setBusy(true);
    setError("");
    setCopyNotice("");
    setCopiedMessageIndex(null);
    const now = new Date().getTime();
    const base: ChatThread = thread ?? {
      id: crypto.randomUUID(),
      title: content.slice(0, 48),
      messages: [],
      updatedAt: now,
    };
    const history: ChatMessage[] = [
      ...base.messages,
      { role: "user", content, at: now },
    ];
    const optimistic = { ...base, messages: history, updatedAt: now };

    try {
      await putChat(optimistic);
      setThreadId(optimistic.id);
      setText("");
      const answer = await askTutor(content, history.slice(0, -1));
      await putChat({
        ...optimistic,
        messages: [...history, { role: "assistant", content: answer, at: new Date().getTime() }],
        updatedAt: new Date().getTime(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The tutor request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(assistantIndex: number) {
    if (busy || !thread) return;
    let userIndex = assistantIndex - 1;
    while (userIndex >= 0 && thread.messages[userIndex]?.role !== "user") userIndex -= 1;
    if (userIndex < 0) return;

    const userMessage = thread.messages[userIndex]!;
    setBusy(true);
    setError("");
    setCopyNotice("");
    setCopiedMessageIndex(null);
    try {
      const answer = await askTutor(userMessage.content, thread.messages.slice(0, userIndex));
      const messages = thread.messages.map((message, index) =>
        index === assistantIndex ? { ...message, content: answer, at: new Date().getTime() } : message,
      );
      await putChat({ ...thread, messages, updatedAt: new Date().getTime() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The tutor request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyResponse(content: string, index: number) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard is unavailable.");
      await navigator.clipboard.writeText(content);
      setCopiedMessageIndex(index);
      setCopyNotice("Response copied.");
    } catch {
      setCopiedMessageIndex(null);
      setCopyNotice("Copy is unavailable in this browser.");
    }
  }

  function scrollTranscript(position: "top" | "bottom") {
    const target = position === "top" ? transcriptTopRef.current : transcriptBottomRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: position === "top" ? "start" : "end" });
  }

  return (
    <div className="tutor-layout mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 gap-4 px-4 py-6 sm:py-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0">
        <p className="font-note text-2xl text-[var(--indigo)]">Doubt desk</p>
        <h1 className="font-display text-4xl">AI Tutor</h1>
        <p className="mt-2 text-sm leading-6">{SYSTEM_NOTE}</p>
        <button
          type="button"
          className="mt-3 min-h-11 border-2 border-[var(--ink)] px-3 py-2 text-sm"
          onClick={() => { setThreadId(""); setError(""); setText(""); }}
        >
          New thread
        </button>
        {chats.length ? (
          <div
            className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible"
            role="region"
            aria-label="Saved tutor conversations"
            tabIndex={0}
          >
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={`min-h-11 max-w-[18rem] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap border border-[var(--ink)]/30 px-3 py-2 text-left text-sm lg:w-full lg:max-w-full lg:whitespace-normal ${activeThreadId === chat.id ? "bg-[#f6efe4]" : "bg-white"}`}
                onClick={() => { setThreadId(chat.id); setError(""); }}
              >
                {chat.title}
              </button>
            ))}
          </div>
        ) : null}
        <p className="mt-2 max-w-prose text-xs leading-5 text-[var(--muted)]">
          Gemini access is configured by the site operator. Your browser does not store or send an API key.
        </p>
        <Link href="/settings" className="mt-1 inline-block min-h-11 py-2 text-sm underline underline-offset-2">
          Tutor and browser settings
        </Link>
      </aside>

      <section className="tutor-panel manga-panel flex min-h-[70vh] w-full min-w-0 max-w-full flex-col p-3 sm:p-4">
        <div ref={transcriptTopRef} aria-hidden="true" />
        <div className="min-h-0 min-w-0 flex-1 space-y-3" role="region" aria-label="Tutor conversation">
          {(thread?.messages ?? []).map((message, index) => (
            <article
              key={`${thread?.id}-${index}`}
              className={message.role === "user"
                ? "tutor-message ml-auto max-w-[92%] min-w-0 border-2 border-[var(--ink)] bg-white p-3"
                : "tutor-message mr-auto w-full max-w-full min-w-0 bg-[#f6efe4] p-3"}
            >
              <p className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">
                {message.role === "user" ? "You" : "Tutor"}
              </p>
              <RichText text={message.content} />
              {message.role === "assistant" ? (
                <div className="mt-3 flex min-w-0 flex-wrap gap-1 border-t border-[var(--ink)]/15 pt-2" aria-label="Tutor response actions">
                  <ToolbarButton label={copiedMessageIndex === index ? "Copied" : "Copy"} onClick={() => void copyResponse(message.content, index)}>
                    <Copy aria-hidden="true" size={16} />
                  </ToolbarButton>
                  <ToolbarButton label="Regenerate" disabled={busy} onClick={() => void regenerate(index)}>
                    <RotateCcw aria-hidden="true" size={16} />
                  </ToolbarButton>
                  <ToolbarButton label="Scroll to top" onClick={() => scrollTranscript("top")}>
                    <ArrowUpToLine aria-hidden="true" size={16} />
                  </ToolbarButton>
                  <ToolbarButton label="Scroll to bottom" onClick={() => scrollTranscript("bottom")}>
                    <ArrowDownToLine aria-hidden="true" size={16} />
                  </ToolbarButton>
                </div>
              ) : null}
            </article>
          ))}
          {!thread?.messages.length ? (
            <div className="min-w-0 space-y-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="block min-h-11 w-full min-w-0 border border-dashed border-[var(--ink)] px-3 py-2 text-left text-sm"
                  onClick={() => void send(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          {busy ? (
            <article className="mr-auto w-full max-w-full min-w-0 bg-[#f6efe4] p-3" role="status" aria-live="polite">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Tutor</p>
              <p className="mt-1">Working through it…</p>
            </article>
          ) : null}
          {error ? (
            <p className="max-w-full break-words whitespace-pre-wrap text-sm text-[var(--vermilion)]" role="alert">
              {error}
            </p>
          ) : null}
          {copyNotice && copyNotice !== "Response copied." ? (
            <p className="text-xs text-[var(--muted)]" role="status" aria-live="polite">{copyNotice}</p>
          ) : null}
        </div>
        <div ref={transcriptBottomRef} aria-hidden="true" />
        <form
          className="mt-4 flex min-w-0 items-end gap-2 max-sm:flex-col"
          onSubmit={(event) => { event.preventDefault(); void send(); }}
        >
          <textarea
            className="min-h-20 min-w-0 w-full flex-1 border-2 border-[var(--ink)] bg-white p-3 sm:w-auto"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ask a doubt. Paste the official answer if you want a check against it."
            aria-label="Ask the AI tutor"
          />
          <button
            type="submit"
            className="min-h-11 shrink-0 bg-[var(--ink)] px-4 py-2 text-white disabled:opacity-40 max-sm:w-full"
            disabled={busy || !text.trim()}
          >
            {busy ? "…" : "Send"}
          </button>
        </form>
        <p className="sr-only" role="status" aria-live="polite">{copyNotice === "Response copied." ? copyNotice : ""}</p>
      </section>
    </div>
  );
}

function ToolbarButton({
  children,
  disabled = false,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-1.5 border border-[var(--ink)]/50 bg-white px-2 text-xs font-semibold hover:bg-[#fffaf3] disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
