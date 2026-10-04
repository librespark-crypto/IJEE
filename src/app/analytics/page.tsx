"use client";

import type { ReactNode } from "react";
import { BarBlock, TrendChart } from "@/components/charts";
import { useStore } from "@/components/store";
import { formatMarks, formatPercent, round2 } from "@/lib/format";
import { SYLLABUS } from "@/lib/syllabus";

export default function AnalyticsPage() {
  const { attempts, progress } = useStore();
  const submitted = attempts.filter((attempt) => attempt.status === "submitted" && attempt.evaluation);
  const scored = submitted.filter((attempt) => attempt.evaluation?.scored);
  const questions = submitted.reduce((sum, attempt) => sum + (attempt.evaluation?.attempted ?? 0), 0);
  const avgScore = average(scored.map((attempt) => attempt.evaluation?.percentage ?? 0));
  const best = Math.max(0, ...scored.map((attempt) => attempt.evaluation?.percentage ?? 0));
  const avgAccuracy = average(scored.map((attempt) => attempt.evaluation?.accuracy ?? 0));
  const chronological = submitted.slice().reverse();
  const scoreTrend = chronological.map((attempt, index) => ({ name: label(attempt.submittedAt ?? attempt.updatedAt, index), value: round2(attempt.evaluation?.percentage ?? 0) }));
  const accuracyTrend = chronological.map((attempt, index) => ({ name: label(attempt.submittedAt ?? attempt.updatedAt, index), value: round2(attempt.evaluation?.accuracy ?? 0) }));
  const timeTrend = chronological.map((attempt, index) => ({ name: label(attempt.submittedAt ?? attempt.updatedAt, index), value: Math.round((attempt.evaluation?.avgTime ?? 0) / 1) }));
  const subjectTrend = ["Physics", "Chemistry", "Mathematics"].map((name) => ({
    name,
    value: round2(average(scored.map((attempt) => attempt.evaluation?.subjects.find((subject) => subject.name === name)?.accuracy ?? NaN).filter((n) => Number.isFinite(n)))),
  })).filter((row) => Number.isFinite(row.value));

  const repeated = repeatedMistakes(submitted);
  const strongTopics = progress.filter((item) => item.status === "strong").map((item) => SYLLABUS.find((topic) => topic.id === item.topicId)?.topic).filter(Boolean);
  const weakTopics = progress.filter((item) => item.status === "revision" || (item.testAccuracy != null && item.testAccuracy < 50)).map((item) => SYLLABUS.find((topic) => topic.id === item.topicId)?.topic).filter(Boolean);
  const weakSections = aggregateSections(scored).filter((row) => row.accuracy < 55 && row.count >= 3).slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="font-note text-2xl text-[var(--indigo)]">Only what you actually sat</p>
      <h1 className="font-display text-5xl">My Analytics</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Tests imported & attempted" value={String(new Set(submitted.map((attempt) => attempt.testId)).size)} />
        <Tile label="Attempts" value={String(attempts.length)} />
        <Tile label="Questions attempted" value={String(questions)} />
        <Tile label="Average score" value={scored.length ? formatPercent(avgScore) : "—"} />
        <Tile label="Best score" value={scored.length ? formatPercent(best) : "—"} />
        <Tile label="Average accuracy" value={scored.length ? formatPercent(avgAccuracy) : "—"} />
      </div>
      {submitted.length === 0 ? <p className="manga-panel mt-6 p-5 text-sm">Analytics stays blank until a paper is submitted. No sample trend is drawn.</p> : null}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Score trend"><TrendChart data={scoreTrend} label="Score %" /></Panel>
        <Panel title="Accuracy trend"><TrendChart data={accuracyTrend} label="Accuracy %" /></Panel>
        <Panel title="Subject accuracy"><BarBlock data={subjectTrend} label="Accuracy %" /></Panel>
        <Panel title="Time-management trend"><TrendChart data={timeTrend} label="Avg seconds / question" /></Panel>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Strong topics">{listOrEmpty(strongTopics as string[], "Mark topics strong in the syllabus tracker. This list is not inferred from a paper that had no topic tags.")}</Panel>
        <Panel title="Weak topics">{listOrEmpty([...(weakTopics as string[]), ...weakSections.map((row) => `${row.name} ${row.accuracy.toFixed(0)}% across attempts`)], "No weak topic has been recorded yet.")}</Panel>
        <Panel title="Repeated mistakes">{repeated.length ? <ul className="space-y-2 text-sm">{repeated.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-sm text-[var(--muted)]">A mistake counts as repeated only when the same question is incorrect on two submitted attempts.</p>}</Panel>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return <article className="border-2 border-[var(--ink)] bg-white p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p><p className="font-display text-4xl">{value}</p></article>;
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <article className="manga-panel p-4"><h2 className="mb-2 font-display text-2xl">{title}</h2>{children}</article>;
}
function listOrEmpty(items: string[], empty: string) {
  if (!items.length) return <p className="text-sm text-[var(--muted)]">{empty}</p>;
  return <ul className="space-y-1 text-sm">{items.slice(0, 8).map((item) => <li key={item}>{item}</li>)}</ul>;
}
function average(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}
function label(ts: number, index: number) {
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" }) || `#${index + 1}`;
}
function repeatedMistakes(attempts: { testId: string; testName: string; evaluation?: { questions: { number: number; section: string; status: string; displayNumber: number }[] } }[]) {
  const map = new Map<string, { count: number; label: string }>();
  for (const attempt of attempts) {
    for (const question of attempt.evaluation?.questions ?? []) {
      if (question.status !== "incorrect") continue;
      const key = `${attempt.testId}:${question.section}:${question.number}`;
      const row = map.get(key) ?? { count: 0, label: `${attempt.testName} · ${question.section} Q${question.displayNumber}` };
      row.count += 1;
      map.set(key, row);
    }
  }
  return [...map.values()].filter((row) => row.count >= 2).map((row) => `${row.label} wrong on ${row.count} attempts`);
}
function aggregateSections(attempts: { evaluation?: { questions: { section: string; canonicalSubject: string; status: string }[] } }[]) {
  const map = new Map<string, { correct: number; judged: number }>();
  for (const attempt of attempts) {
    for (const question of attempt.evaluation?.questions ?? []) {
      if (!["correct", "incorrect", "partial"].includes(question.status)) continue;
      const key = `${question.canonicalSubject} · ${question.section}`;
      const row = map.get(key) ?? { correct: 0, judged: 0 };
      row.judged += 1;
      if (question.status === "correct") row.correct += 1;
      map.set(key, row);
    }
  }
  return [...map.entries()].map(([name, row]) => ({ name, accuracy: (row.correct / row.judged) * 100, count: row.judged })).sort((a, b) => a.accuracy - b.accuracy);
}
