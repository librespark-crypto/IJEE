"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/store";
import { createAttempt } from "@/lib/attempt";
import { examLabel, formatDate, kindLabel } from "@/lib/format";

export default function TestsPage() {
  const router = useRouter();
  const { tests, attempts, settings, putAttempt, removeTest } = useStore();
  const [confirmId, setConfirmId] = useState("");

  async function start(testId: string) {
    const test = tests.find((item) => item.id === testId);
    if (!test) return;
    const attempt = createAttempt(test, settings.numbering, settings.realExamSave);
    await putAttempt(attempt);
    router.push(`/exam/${attempt.id}`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="font-note text-2xl text-[var(--indigo)]">The shelf</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-5xl">Tests</h1>
        <Link href="/practice" className="bg-[var(--vermilion)] px-4 py-2 font-semibold text-white">Import ZIP</Link>
      </div>
      {tests.length === 0 ? <p className="manga-panel mt-6 p-6">No papers yet. The shelf stays empty until a PDF2CBT ZIP is imported.</p> : null}
      <div className="mt-6 grid gap-4">
        {tests.map((test) => {
          const related = attempts.filter((attempt) => attempt.testId === test.id);
          const latest = related.find((attempt) => attempt.status === "submitted");
          const open = related.find((attempt) => attempt.status === "ongoing");
          return (
            <article key={test.id} className="manga-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-3xl">{test.name}</h2>
                  <p className="text-sm text-[var(--muted)]">{examLabel(test.examType)} · {kindLabel(test.kind)} · {test.questions.length} questions · {formatDate(test.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {open ? <Link className="bg-[var(--indigo)] px-3 py-2 text-sm text-white" href={`/exam/${open.id}`}>Resume</Link> : null}
                  <button className="bg-[var(--ink)] px-3 py-2 text-sm text-white" onClick={() => void start(test.id)}>{latest ? "Retake" : "Start"}</button>
                  {latest ? <Link className="border-2 border-[var(--ink)] px-3 py-2 text-sm" href={`/analysis/${latest.id}`}>Latest analysis</Link> : null}
                  <button className="border-2 border-[var(--vermilion)] px-3 py-2 text-sm" onClick={() => setConfirmId(test.id)}>Delete</button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {test.subjects.map((subject) => <span key={subject} className="border border-[var(--ink)] px-2 py-1">{subject} {test.questions.filter((q) => q.canonicalSubject === subject).length}</span>)}
                <span className="border border-[var(--ink)] px-2 py-1">{test.questions.filter((q) => q.hasAnswerKey).length} keyed</span>
              </div>
            </article>
          );
        })}
      </div>
      {confirmId ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md border-[3px] border-[var(--ink)] bg-[#fffaf3] p-5">
            <h2 className="font-display text-3xl">Delete this paper?</h2>
            <p className="mt-2 text-sm">Attempts and question images for it leave this browser too.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="border-2 border-[var(--ink)] px-3 py-2" onClick={() => setConfirmId("")}>Keep</button>
              <button className="bg-[var(--vermilion)] px-3 py-2 text-white" onClick={() => { void removeTest(confirmId); setConfirmId(""); }}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
