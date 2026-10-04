"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { cx } from "@/lib/format";
import { SYLLABUS, SYLLABUS_SOURCE, chaptersOf } from "@/lib/syllabus";
import type { TopicProgress, TopicStatus } from "@/lib/types";

const SUBJECTS = ["Physics", "Chemistry", "Mathematics"] as const;
const STATUSES: { id: TopicStatus; label: string }[] = [
  { id: "not_started", label: "Not Started" },
  { id: "learning", label: "Learning" },
  { id: "completed", label: "Completed" },
  { id: "revision", label: "Revision Required" },
  { id: "strong", label: "Strong" },
];

export default function SyllabusPage() {
  const { progress, putProgress, attempts } = useStore();
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>("Physics");
  const [query, setQuery] = useState("");
  const [exam, setExam] = useState<"all" | "JM" | "JA">("all");
  const [open, setOpen] = useState<string | null>(SYLLABUS.find((item) => item.subject === "Physics")?.chapter ?? null);
  const [catalog, setCatalog] = useState("bundle");

  useEffect(() => {
    void fetch("/api/syllabus").then((response) => response.json()).then((payload: { source?: string }) => {
      if (payload.source) setCatalog(payload.source);
    }).catch(() => setCatalog("bundle"));
  }, []);

  const progressMap = useMemo(() => new Map(progress.map((item) => [item.topicId, item])), [progress]);
  const chapters = chaptersOf(subject).map((chapter) => ({
    ...chapter,
    topics: chapter.topics.filter((topic) => {
      const examOk = exam === "all" || topic.exams.includes(exam);
      const text = `${topic.topic} ${topic.subtopics.join(" ")} ${topic.chapter}`.toLowerCase();
      return examOk && (!query || text.includes(query.toLowerCase()));
    }),
  })).filter((chapter) => chapter.topics.length);

  const latest = attempts.find((attempt) => attempt.status === "submitted" && attempt.evaluation?.scored);

  function update(topicId: string, patch: Partial<TopicProgress>) {
    const current = progressMap.get(topicId);
    void putProgress({
      topicId,
      status: current?.status ?? "not_started",
      lecturesCompleted: current?.lecturesCompleted ?? 0,
      questionsSolved: current?.questionsSolved ?? 0,
      revisionCount: current?.revisionCount ?? 0,
      lastRevision: current?.lastRevision ?? null,
      notes: current?.notes ?? "",
      testAccuracy: current?.testAccuracy ?? null,
      updatedAt: Date.now(),
      ...patch,
    });
  }

  function stampSubject() {
    if (!latest?.evaluation) return;
    const bucket = latest.evaluation.subjects.find((item) => item.name === subject);
    if (!bucket) return;
    for (const chapter of chapters) {
      for (const topic of chapter.topics) update(topic.id, { testAccuracy: Math.round(bucket.accuracy) });
    }
  }

  const totals = SYLLABUS.filter((item) => item.subject === subject);
  const done = totals.filter((item) => ["completed", "strong"].includes(progressMap.get(item.id)?.status ?? "")).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="font-note text-2xl text-[var(--vermilion)]">The map for 2027</p>
      <h1 className="font-display text-5xl">Syllabus</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6">{SYLLABUS_SOURCE.advanced} {SYLLABUS_SOURCE.main} JM means JEE Main. JA means JEE Advanced. A topic can carry both.</p>
      <p className="mt-2 text-xs text-[var(--muted)]">Catalog source: {catalog === "postgres" ? "PostgreSQL official catalog" : "bundled official catalog, works offline"}.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {SUBJECTS.map((item) => (
          <button key={item} className={cx("border-2 border-[var(--ink)] px-3 py-2", subject === item ? "bg-[var(--ink)] text-white" : "bg-white")} onClick={() => setSubject(item)}>{item}</button>
        ))}
        <select className="border-2 border-[var(--ink)] bg-white px-3 py-2" value={exam} onChange={(event) => setExam(event.target.value as "all" | "JM" | "JA")}>
          <option value="all">JM + JA</option>
          <option value="JM">JEE Main</option>
          <option value="JA">JEE Advanced</option>
        </select>
        <input className="min-w-48 flex-1 border-2 border-[var(--ink)] bg-white px-3 py-2" placeholder="Search a topic" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">{done} / {totals.length} {subject} topics completed or strong</p>
        <button className="border-2 border-[var(--ink)] px-3 py-2 text-sm disabled:opacity-40" disabled={!latest} onClick={stampSubject}>Stamp latest {subject} accuracy onto visible topics</button>
      </div>
      <div className="mt-2 h-3 border-2 border-[var(--ink)]"><div className="h-full bg-[var(--indigo)]" style={{ width: `${totals.length ? (done / totals.length) * 100 : 0}%` }} /></div>

      <div className="mt-6 space-y-3">
        {chapters.map((chapter) => (
          <section key={chapter.chapter} className="border-[3px] border-[var(--ink)] bg-[#fffaf3]">
            <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setOpen(open === chapter.chapter ? null : chapter.chapter)}>
              <span><span className="font-note text-lg text-[var(--vermilion)]">{chapter.unit}</span><span className="mt-1 block font-display text-2xl">{chapter.chapter}</span></span>
              <span className="text-sm">{chapter.topics.length} topics</span>
            </button>
            {open === chapter.chapter ? (
              <div className="space-y-3 border-t-[3px] border-[var(--ink)] p-3">
                {chapter.topics.map((topic) => {
                  const row = progressMap.get(topic.id);
                  return (
                    <article key={topic.id} className="bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">{topic.topic}</h3>
                          <p className="text-xs text-[var(--muted)]">Class {topic.classLevel} · {topic.exams.join(" · ")}</p>
                        </div>
                        <select className="border border-[var(--ink)] px-2 py-1 text-sm" value={row?.status ?? "not_started"} onChange={(event) => update(topic.id, { status: event.target.value as TopicStatus })}>
                          {STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
                        </select>
                      </div>
                      <ul className="mt-2 list-disc pl-5 text-sm leading-6">{topic.subtopics.map((item) => <li key={item}>{item}</li>)}</ul>
                      <div className="mt-3 grid gap-2 sm:grid-cols-4">
                        <Num label="Lectures" value={row?.lecturesCompleted ?? 0} onChange={(value) => update(topic.id, { lecturesCompleted: value })} />
                        <Num label="Questions solved" value={row?.questionsSolved ?? 0} onChange={(value) => update(topic.id, { questionsSolved: value })} />
                        <div className="text-sm">
                          <span className="block text-xs uppercase text-[var(--muted)]">Revisions</span>
                          <button className="mt-1 border border-[var(--ink)] px-2 py-1" onClick={() => update(topic.id, { revisionCount: (row?.revisionCount ?? 0) + 1, lastRevision: Date.now() })}>Log {row?.revisionCount ?? 0}</button>
                        </div>
                        <div className="text-sm">
                          <span className="block text-xs uppercase text-[var(--muted)]">Test performance</span>
                          <span>{row?.testAccuracy == null ? "Not stamped" : `${row.testAccuracy}%`}</span>
                          <span className="block text-xs text-[var(--muted)]">{row?.lastRevision ? `Revised ${new Date(row.lastRevision).toLocaleDateString()}` : "No revision logged"}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm">
      <span className="block text-xs uppercase text-[var(--muted)]">{label}</span>
      <input className="mt-1 w-full border border-[var(--ink)] px-2 py-1" type="number" min={0} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
