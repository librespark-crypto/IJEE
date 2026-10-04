"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BarBlock } from "@/components/charts";
import { RichText } from "@/components/latex";
import { useStore } from "@/components/store";
import { buildEvaluation } from "@/lib/evaluate";
import { cx, examLabel, formatClock, formatDate, formatDuration, formatMarks, formatPercent, resultLabel, typeLabel } from "@/lib/format";
import { getImages } from "@/lib/storage";
import type { Attempt, Evaluation, QuestionAnalysis, QuestionType, ResultStatus, StoredTest } from "@/lib/types";

const FILTERS = ["All", "Correct", "Incorrect", "Unattempted", "Marked", "Physics", "Chemistry", "Mathematics", "Single", "MSQ", "Numerical", "Matrix"] as const;

export function AnalysisView({ attemptId }: { attemptId: string }) {
  const { ready, attempts, tests, putAttempt, settings } = useStore();
  const attempt = attempts.find((item) => item.id === attemptId);
  const test = tests.find((item) => item.id === attempt?.testId);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  const evaluation = useMemo(() => (attempt && test ? buildEvaluation(test, attempt) : undefined), [attempt, test]);

  useEffect(() => {
    if (!attempt || !test || !evaluation) return;
    const stored = attempt.evaluation;
    const changed = !stored || stored.score !== evaluation.score || stored.missingKeyCount !== evaluation.missingKeyCount || stored.correct !== evaluation.correct;
    if (changed) void putAttempt({ ...attempt, evaluation });
  }, [attempt, test, evaluation, putAttempt]);

  useEffect(() => {
    if (!test) return;
    let cancelled = false;
    const created: string[] = [];
    void getImages(test.questions.flatMap((question) => question.imageIds)).then((blobs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, blob] of blobs) {
        const url = URL.createObjectURL(blob);
        created.push(url);
        next[id] = url;
      }
      setUrls(next);
    });
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [test]);

  if (!ready) return <p className="p-8">Opening the analysis…</p>;
  if (!attempt || !test || !evaluation) {
    return <p className="p-8">This analysis is not stored in this browser.</p>;
  }

  const rows = evaluation.questions.filter((question) => matches(question, filter));
  const open = evaluation.questions.find((question) => question.questionId === openId) ?? null;

  async function explain(question: QuestionAnalysis) {
    setBusy(true);
    setAiError("");
    try {
      const images = [];
      for (const id of question.imageIds.slice(0, 2)) {
        const blob = await blobFromUrl(urls[id]);
        if (!blob) continue;
        images.push({ mimeType: blob.type || "image/png", data: await toBase64(blob) });
      }
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.geminiApiKey,
          model: settings.geminiModel,
          images,
          prompt: `Explain this imported JEE question. The deterministic evaluation is the source of truth.
Subject: ${question.subject}
Section: ${question.section}
Type: ${typeLabel(question.type)}
Official correct answer: ${question.correctLabel}
Student answer: ${question.userLabel}
Result: ${resultLabel(question.status)}
Marks: ${question.marks} out of ${question.maxMarks}
Time spent: ${question.timeSpent} seconds
${question.solution ? `Imported solution text:\n${question.solution}` : "No imported solution text was in the ZIP. Use the attached question images. If they are unreadable, say what is missing. Do not invent a different answer key."}
Give a rigorous solution, an alternate method if one exists, the concept, and classify the student's miss as conceptual, calculation, or interpretation if it was wrong.`,
        }),
      });
      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !payload.text) throw new Error(payload.error || "Gemini could not explain this question.");
      const next: Attempt = {
        ...attempt!,
        explanations: { ...(attempt!.explanations ?? {}), [question.questionId]: payload.text },
        updatedAt: Date.now(),
      };
      await putAttempt(next);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Gemini request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="font-note text-xl text-[var(--vermilion)]">Chapter 03 · The marked paper</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">{test.name}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{examLabel(test.examType)} · submitted {attempt.submittedAt ? formatDate(attempt.submittedAt) : "—"} {attempt.autoSubmitted ? "· auto-submitted" : ""}</p>
        </div>
        <Link href="/history" className="border-2 border-[var(--ink)] px-3 py-2 text-sm font-semibold">Back to history</Link>
      </div>

      {!evaluation.scored ? (
        <p className="manga-panel mt-5 p-4 text-sm">No answer key was in the ZIP, so marks were not invented. Time and attempt data below are from this sitting. Attach a PDF2CBT answer-key file from Practice to score it.</p>
      ) : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Score" value={evaluation.scored ? `${formatMarks(evaluation.score)} / ${formatMarks(evaluation.maxMarks)}` : "Not scored"} note={evaluation.scored ? formatPercent(evaluation.percentage) : "Key required"} />
        <Stat label="Accuracy" value={evaluation.scored ? formatPercent(evaluation.accuracy) : "—"} note={`${evaluation.correct} correct · ${evaluation.incorrect} incorrect · ${evaluation.partial} partial`} />
        <Stat label="Attempt" value={formatPercent(evaluation.attemptRate)} note={`${evaluation.attempted} of ${evaluation.considered} considered`} />
        <Stat label="Time" value={formatDuration(Math.max(0, attempt.durationSeconds - attempt.remainingSeconds))} note={`Avg ${formatDuration(evaluation.avgTime)} / question · negative ${formatMarks(evaluation.negativeMarks)}`} />
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        {evaluation.subjects.map((subject) => (
          <article key={subject.name} className="manga-panel p-4">
            <h2 className="font-display text-2xl">{subject.name}</h2>
            <p className="mt-1 font-note text-lg">{evaluation.scored ? `${formatMarks(subject.score)} / ${formatMarks(subject.maxMarks)}` : "Unscored"}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Mini label="Accuracy" value={evaluation.scored ? formatPercent(subject.accuracy) : "—"} />
              <Mini label="Attempt" value={formatPercent(subject.attemptRate)} />
              <Mini label="Correct" value={String(subject.correct)} />
              <Mini label="Incorrect" value={String(subject.incorrect)} />
              <Mini label="Unattempted" value={String(subject.unattempted)} />
              <Mini label="Time" value={formatDuration(subject.timeSpent)} />
              <Mini label="Avg / Q" value={formatDuration(subject.avgTime)} />
              <Mini label="Partial" value={String(subject.partial)} />
            </dl>
          </article>
        ))}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <article className="manga-panel p-4">
          <h2 className="font-display text-2xl">Time by subject</h2>
          <BarBlock data={evaluation.subjects.map((subject) => ({ name: subject.name, value: Math.round(subject.timeSpent / 60) }))} label="Minutes" />
        </article>
        <article className="manga-panel p-4">
          <h2 className="font-display text-2xl">Time by section</h2>
          <BarBlock data={evaluation.sections.map((section) => ({ name: section.name, value: Math.round(section.timeSpent / 60) }))} label="Minutes" />
        </article>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-3xl">Performance insights</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {evaluation.insights.length ? evaluation.insights.map((insight) => (
            <article key={insight.id} className="border-2 border-[var(--ink)] bg-white p-4">
              <p className="font-note text-sm uppercase tracking-wide text-[var(--vermilion)]">{insight.tone}</p>
              <h3 className="mt-1 font-semibold">{insight.title}</h3>
              <p className="mt-2 text-sm leading-6">{insight.detail}</p>
            </article>
          )) : <p className="text-sm text-[var(--muted)]">Not enough judged questions to make a specific claim.</p>}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-3xl">Question analysis</h2>
          <p className="text-sm text-[var(--muted)]">{rows.length} shown</p>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {FILTERS.map((item) => (
            <button key={item} className={cx("shrink-0 border-2 border-[var(--ink)] px-3 py-1 text-sm", filter === item ? "bg-[var(--ink)] text-white" : "bg-white")} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto border-2 border-[var(--ink)] bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#f6efe4] text-xs uppercase tracking-wide">
              <tr>
                {["Q", "Subject", "Section", "Type", "You", "Key", "Result", "Marks", "Time"].map((head) => <th key={head} className="px-3 py-2">{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((question) => (
                <tr key={question.questionId} className="cursor-pointer border-t hover:bg-[#fff8ee]" onClick={() => setOpenId(question.questionId)}>
                  <td className="px-3 py-2 font-semibold">{question.displayNumber}</td>
                  <td className="px-3 py-2">{question.canonicalSubject}</td>
                  <td className="px-3 py-2">{question.section}</td>
                  <td className="px-3 py-2">{typeLabel(question.type)}</td>
                  <td className="px-3 py-2">{question.userLabel}</td>
                  <td className="px-3 py-2">{question.correctLabel}</td>
                  <td className={cx("px-3 py-2 font-semibold", tone(question.status))}>{resultLabel(question.status)}</td>
                  <td className="px-3 py-2">{formatMarks(question.marks)} / {formatMarks(question.maxMarks)}</td>
                  <td className="px-3 py-2">{formatClock(question.timeSpent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {open ? (
        <section className="manga-panel mt-6 p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-note text-lg">Solution · Q{open.displayNumber}</p>
              <h2 className="font-display text-3xl">{open.canonicalSubject} · {open.section}</h2>
              <p className="mt-1 text-sm">{typeLabel(open.type)} · {resultLabel(open.status)} · {formatMarks(open.marks)} / {formatMarks(open.maxMarks)} · {formatDuration(open.timeSpent)}</p>
            </div>
            <button className="border-2 border-[var(--ink)] px-3 py-2 text-sm" onClick={() => setOpenId(null)}>Close</button>
          </div>
          <div className="mt-4 space-y-3 bg-white p-3">
            {open.imageIds.map((id) => urls[id] ? <img key={id} src={urls[id]} alt="" className="mx-auto h-auto max-w-full" /> : <p key={id} className="text-sm">Image missing from local storage.</p>)}
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <Mini label="Your answer" value={open.userLabel} />
            <Mini label="Official key" value={open.correctLabel} />
            <Mini label="Topic from ZIP" value={open.topic || "Not tagged in the ZIP"} />
            <Mini label="Concept from ZIP" value={open.concept || "Not tagged in the ZIP"} />
          </dl>
          <div className="mt-4">
            <h3 className="font-semibold">Imported solution</h3>
            {open.solution ? <RichText text={open.solution} /> : <p className="mt-1 text-sm text-[var(--muted)]">This ZIP did not include a solution. The question image was not rewritten.</p>}
          </div>
          <div className="mt-4 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Tutor note</h3>
              <button className="bg-[var(--indigo)] px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void explain(open)}>{busy ? "Asking…" : "Explain with Gemini"}</button>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">Gemini can explain. It cannot change the key or the marks.</p>
            {aiError ? <p className="mt-2 text-sm text-[var(--vermilion)]">{aiError}</p> : null}
            {attempt.explanations?.[open.questionId] ? <div className="mt-3"><RichText text={attempt.explanations[open.questionId]!} /></div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="manga-panel p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{note}</p>
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt><dd className="font-semibold">{value}</dd></div>;
}

function matches(question: QuestionAnalysis, filter: (typeof FILTERS)[number]) {
  if (filter === "All") return true;
  if (filter === "Correct") return question.status === "correct";
  if (filter === "Incorrect") return question.status === "incorrect" || question.status === "partial";
  if (filter === "Unattempted") return question.status === "notAnswered";
  if (filter === "Marked") return question.marked;
  if (filter === "Physics" || filter === "Chemistry" || filter === "Mathematics") return question.canonicalSubject === filter;
  const type: Record<string, QuestionType> = { Single: "mcq", MSQ: "msq", Numerical: "nat", Matrix: "msm" };
  return question.type === type[filter];
}

function tone(status: ResultStatus) {
  if (status === "correct" || status === "bonus" || status === "dropped") return "text-[var(--moss)]";
  if (status === "incorrect") return "text-[var(--vermilion)]";
  if (status === "partial") return "text-[var(--gold)]";
  return "text-[var(--muted)]";
}

async function blobFromUrl(url?: string) {
  if (!url) return null;
  const response = await fetch(url);
  return response.blob();
}

async function toBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
