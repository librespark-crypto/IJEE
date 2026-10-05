"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AttemptQualityChart,
  BarBlock,
  ClusteredBarChart,
  SegmentedBar,
  SubjectTimeBar,
} from "@/components/charts";
import { RichText } from "@/components/latex";
import { useStore } from "@/components/store";
import { buildDashboardData, type AttemptQuality, type DifficultyLevel } from "@/lib/analytics";
import { buildEvaluation } from "@/lib/evaluate";
import {
  cx,
  examLabel,
  formatClock,
  formatDate,
  formatDuration,
  formatMarks,
  formatPercent,
  resultLabel,
  typeLabel,
} from "@/lib/format";
import { getImages } from "@/lib/storage";
import type { Attempt, Evaluation, QuestionAnalysis, StoredTest } from "@/lib/types";

const TABS = [
  "Overview",
  "Performance Analysis",
  "Time Analysis",
  "Attempt Analysis",
  "Difficulty Analysis",
  "Subject Movement",
  "Question Journey",
  "Qs by Qs Analysis",
] as const;

type Tab = (typeof TABS)[number];

const REVIEW_FILTERS = ["All", "Incorrect Only", "Marked for Review", "Correct", "Unattempted"] as const;
type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export function ReviewDashboard({ attemptId }: { attemptId: string }) {
  const { ready, attempts, tests, putAttempt, settings } = useStore();
  const attempt = attempts.find((item) => item.id === attemptId);
  const test = tests.find((item) => item.id === attempt?.testId);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("All");
  const [learnings, setLearnings] = useState<string[]>([]);
  const [newLearning, setNewLearning] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  const evaluation = useMemo(
    () => (attempt && test ? buildEvaluation(test, attempt) : undefined),
    [attempt, test],
  );

  const dashboard = useMemo(
    () => (test && attempt && evaluation ? buildDashboardData(test, attempt, evaluation) : undefined),
    [test, attempt, evaluation],
  );

  useEffect(() => {
    if (!attempt || !test || !evaluation) return;
    const stored = attempt.evaluation;
    const changed = JSON.stringify(stored) !== JSON.stringify(evaluation);
    if (changed) void putAttempt({ ...attempt, evaluation });
  }, [attempt, test, evaluation, putAttempt]);

  useEffect(() => {
    if (!test) return;
    let cancelled = false;
    const created: string[] = [];
    void getImages(test.questions.flatMap((q) => q.imageIds)).then((blobs) => {
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

  // Load learnings from localStorage
  useEffect(() => {
    if (attemptId) {
      try {
        const stored = localStorage.getItem(`learnings-${attemptId}`);
        if (stored) setLearnings(JSON.parse(stored));
      } catch { /* ignore */ }
    }
  }, [attemptId]);

  const saveLearnings = useCallback((items: string[]) => {
    setLearnings(items);
    if (attemptId) {
      try { localStorage.setItem(`learnings-${attemptId}`, JSON.stringify(items)); } catch { /* ignore */ }
    }
  }, [attemptId]);

  // Filtered questions for review mode
  const reviewQuestions = useMemo(() => {
    if (!evaluation) return [];
    const qs = evaluation.questions;
    switch (reviewFilter) {
      case "Incorrect Only": return qs.filter((q) => q.status === "incorrect" || q.status === "partial");
      case "Marked for Review": return qs.filter((q) => q.marked);
      case "Correct": return qs.filter((q) => q.status === "correct");
      case "Unattempted": return qs.filter((q) => q.status === "notAnswered");
      default: return qs;
    }
  }, [evaluation, reviewFilter]);

  const currentReviewQuestion = reviewQuestions[reviewIndex] ?? null;

  async function explainWithAI(question: QuestionAnalysis) {
    if (!attempt) return;
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
${question.solution ? `Imported solution text:\n${question.solution}` : "No imported solution text was in the ZIP. Use the attached question images."}
Give a rigorous step-by-step solution, an alternate method if one exists, the concept, and classify the student's miss as conceptual, calculation, or interpretation if it was wrong.`,
        }),
      });
      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !payload.text) throw new Error(payload.error || "Gemini could not explain this question.");
      const next: Attempt = {
        ...attempt,
        explanations: { ...(attempt.explanations ?? {}), [question.questionId]: payload.text },
        updatedAt: Date.now(),
      };
      await putAttempt(next);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Gemini request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p className="p-8 font-note text-lg">Loading the review scroll…</p>;
  if (!attempt || !test || !evaluation || !dashboard) {
    return <p className="p-8">This analysis is not stored in this browser.</p>;
  }

  // Review mode stepper view
  if (reviewMode) {
    return (
      <QuestionReviewStepper
        test={test}
        attempt={attempt}
        evaluation={evaluation}
        dashboard={dashboard}
        urls={urls}
        questions={reviewQuestions}
        currentIndex={reviewIndex}
        filter={reviewFilter}
        onIndexChange={setReviewIndex}
        onFilterChange={(f) => { setReviewFilter(f); setReviewIndex(0); }}
        onClose={() => setReviewMode(false)}
        onExplain={(q) => void explainWithAI(q)}
        busy={busy}
        aiError={aiError}
        onJumpToQuestion={(qId) => {
          const idx = reviewQuestions.findIndex((q) => q.questionId === qId);
          if (idx >= 0) setReviewIndex(idx);
        }}
      />
    );
  }

  const timeUsed = Math.max(0, attempt.durationSeconds - attempt.remainingSeconds);

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 md:px-6">
      {/* Header */}
      <div className="manga-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-note text-lg text-[var(--vermilion)]">Chapter 03 · The Marked Paper</p>
            <h1 className="font-display text-3xl md:text-5xl">{test.name}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {examLabel(test.examType)} · submitted {attempt.submittedAt ? formatDate(attempt.submittedAt) : "—"}
              {attempt.autoSubmitted ? " · auto-submitted" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="manga-btn manga-btn-primary"
              onClick={() => { setReviewMode(true); setReviewIndex(0); }}
            >
              📖 View Solutions
            </button>
            <Link href="/history" className="manga-btn">
              ← Back to History
            </Link>
          </div>
        </div>
      </div>

      {!evaluation.scored ? (
        <div className="speech-bubble mt-4">
          <p className="font-note text-sm">
            No answer key was in the ZIP, so marks were not invented. Time and attempt data below are from this sitting.
            Attach a PDF2CBT answer-key file from Practice to score it.
          </p>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="manga-tabs mt-6">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={cx("manga-tab", activeTab === tab && "manga-tab-active")}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "Overview" && (
          <OverviewTab
            evaluation={evaluation}
            dashboard={dashboard}
            timeUsed={timeUsed}
            learnings={learnings}
            onAddLearning={(text) => saveLearnings([...learnings, text])}
            onRemoveLearning={(index) => saveLearnings(learnings.filter((_, i) => i !== index))}
            newLearning={newLearning}
            setNewLearning={setNewLearning}
          />
        )}
        {activeTab === "Performance Analysis" && (
          <PerformanceTab evaluation={evaluation} dashboard={dashboard} />
        )}
        {activeTab === "Time Analysis" && (
          <TimeTab evaluation={evaluation} dashboard={dashboard} />
        )}
        {activeTab === "Attempt Analysis" && (
          <AttemptTab evaluation={evaluation} dashboard={dashboard} />
        )}
        {activeTab === "Difficulty Analysis" && (
          <DifficultyTab evaluation={evaluation} dashboard={dashboard} />
        )}
        {activeTab === "Subject Movement" && (
          <SubjectMovementTab dashboard={dashboard} />
        )}
        {activeTab === "Question Journey" && (
          <QuestionJourneyTab dashboard={dashboard} evaluation={evaluation} onJumpToQuestion={(qId) => {
            setReviewMode(true);
            setReviewFilter("All");
            const allQs = evaluation.questions;
            const idx = allQs.findIndex((q) => q.questionId === qId);
            if (idx >= 0) setReviewIndex(idx);
          }} />
        )}
        {activeTab === "Qs by Qs Analysis" && (
          <QsByQsTab
            evaluation={evaluation}
            dashboard={dashboard}
            onJumpToQuestion={(qId) => {
              setReviewMode(true);
              setReviewFilter("All");
              const allQs = evaluation.questions;
              const idx = allQs.findIndex((q) => q.questionId === qId);
              if (idx >= 0) setReviewIndex(idx);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ==================== OVERVIEW TAB ====================
function OverviewTab({
  evaluation,
  dashboard,
  timeUsed,
  learnings,
  onAddLearning,
  onRemoveLearning,
  newLearning,
  setNewLearning,
}: {
  evaluation: Evaluation;
  dashboard: ReturnType<typeof buildDashboardData>;
  timeUsed: number;
  learnings: string[];
  onAddLearning: (text: string) => void;
  onRemoveLearning: (index: number) => void;
  newLearning: string;
  setNewLearning: (text: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Score Cards Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MangaStatCard
          label="Total Score"
          value={evaluation.scored ? `${formatMarks(evaluation.score)} / ${formatMarks(evaluation.maxMarks)}` : "Not Scored"}
          note={evaluation.scored ? formatPercent(evaluation.percentage) : "Key required"}
          accent="primary"
        />
        {evaluation.scored && dashboard.predictedPercentile > 0 ? (
          <MangaStatCard
            label="Predicted Percentile"
            value={`${dashboard.predictedPercentile.toFixed(1)}`}
            note="Based on score %"
            accent="gold"
            badge={`≥ ${dashboard.predictedPercentile.toFixed(0)}%ile`}
          />
        ) : (
          <MangaStatCard label="Predicted Percentile" value="—" note="Score needed" accent="muted" />
        )}
        <MangaStatCard
          label="Accuracy"
          value={evaluation.scored ? formatPercent(evaluation.accuracy) : "—"}
          note={`${evaluation.correct}✓ · ${evaluation.incorrect}✗ · ${evaluation.partial}~`}
          accent={evaluation.accuracy >= 60 ? "green" : evaluation.accuracy >= 40 ? "gold" : "red"}
        />
        <MangaStatCard
          label="Time Taken"
          value={formatDuration(timeUsed)}
          note={`Avg ${formatDuration(evaluation.avgTime)} / Q · Neg ${formatMarks(evaluation.negativeMarks)}`}
          accent="blue"
        />
      </div>

      {/* Subject Breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        {evaluation.subjects.map((subject) => (
          <article key={subject.name} className="manga-card manga-card--halftone">
            <h3 className="font-display text-2xl">{subject.name}</h3>
            <p className="mt-1 font-note text-xl">
              {evaluation.scored ? `${formatMarks(subject.score)} / ${formatMarks(subject.maxMarks)}` : "Unscored"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <MiniStat label="Accuracy" value={evaluation.scored ? formatPercent(subject.accuracy) : "—"} />
              <MiniStat label="Attempt" value={formatPercent(subject.attemptRate)} />
              <MiniStat label="Correct" value={String(subject.correct)} tone="green" />
              <MiniStat label="Incorrect" value={String(subject.incorrect)} tone="red" />
              <MiniStat label="Unattempted" value={String(subject.unattempted)} tone="muted" />
              <MiniStat label="Time" value={formatDuration(subject.timeSpent)} />
            </div>
          </article>
        ))}
      </div>

      {/* Key Metrics Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricTile label="Questions Attempted" value={`${evaluation.attempted} / ${evaluation.considered}`} />
        <MetricTile label="Positive Score" value={formatMarks(evaluation.score + evaluation.negativeMarks)} />
        <MetricTile label="Marks Lost" value={`−${formatMarks(evaluation.negativeMarks)}`} tone="red" />
        <MetricTile label="Attempt Rate" value={formatPercent(evaluation.attemptRate)} />
        <MetricTile label="Avg Time / Q" value={formatDuration(evaluation.avgTime)} />
      </div>

      {/* Battle Takeaways */}
      <div className="manga-card manga-card--speech">
        <h2 className="font-display text-2xl">📝 Battle Takeaways</h2>
        <p className="mt-1 font-note text-sm text-[var(--muted)]">Note down your key learnings from this test</p>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 border-2 border-black bg-white px-3 py-2 text-sm"
            placeholder="e.g. 'Don't rush numerical questions in Chemistry'"
            value={newLearning}
            onChange={(e) => setNewLearning(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newLearning.trim()) {
                onAddLearning(newLearning.trim());
                setNewLearning("");
              }
            }}
          />
          <button
            className="manga-btn manga-btn-primary"
            disabled={!newLearning.trim()}
            onClick={() => { onAddLearning(newLearning.trim()); setNewLearning(""); }}
          >
            Add
          </button>
        </div>
        {learnings.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {learnings.map((item, i) => (
              <li key={i} className="flex items-start gap-2 border-b border-dashed border-[var(--ink)]/20 pb-2">
                <span className="mt-0.5 font-note text-[var(--vermilion)]">✦</span>
                <span className="flex-1 text-sm">{item}</span>
                <button className="text-xs text-[var(--muted)] hover:text-[var(--vermilion)]" onClick={() => onRemoveLearning(i)}>✕</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">No learnings recorded yet. Add your first takeaway above!</p>
        )}
      </div>
    </div>
  );
}

// ==================== PERFORMANCE TAB ====================
function PerformanceTab({ evaluation, dashboard }: { evaluation: Evaluation; dashboard: ReturnType<typeof buildDashboardData> }) {
  return (
    <div className="space-y-6">
      <div className="manga-card overflow-x-auto">
        <h2 className="font-display text-2xl">Performance Breakdown</h2>
        <table className="manga-table mt-3 w-full min-w-[640px]">
          <thead>
            <tr>
              <th>Section</th>
              <th>Score</th>
              <th>Correct</th>
              <th>Wrong</th>
              <th>Partial</th>
              <th>Unattempted</th>
              <th>Not Considered</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.performanceRows.map((row) => (
              <tr key={row.label}>
                <td className="font-semibold">{row.label}</td>
                <td>{formatMarks(row.score)} / {formatMarks(row.maxMarks)}</td>
                <td className="text-[var(--moss)]">{row.correct}</td>
                <td className="text-[var(--vermilion)]">{row.incorrect}</td>
                <td className="text-[var(--gold)]">{row.partial}</td>
                <td className="text-[var(--muted)]">{row.unattempted}</td>
                <td className="text-[var(--muted)]">{row.notConsidered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Insights */}
      <div>
        <h2 className="font-display text-2xl">Performance Insights</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {evaluation.insights.length > 0 ? evaluation.insights.map((insight) => (
            <article key={insight.id} className={cx("manga-card", `manga-card--tone-${insight.tone}`)}>
              <p className="font-note text-xs uppercase tracking-wide text-[var(--vermilion)]">{insight.tone}</p>
              <h3 className="mt-1 font-semibold">{insight.title}</h3>
              <p className="mt-2 text-sm leading-6">{insight.detail}</p>
            </article>
          )) : <p className="text-sm text-[var(--muted)]">Not enough data for specific insights.</p>}
        </div>
      </div>
    </div>
  );
}

// ==================== TIME TAB ====================
function TimeTab({ evaluation, dashboard }: { evaluation: Evaluation; dashboard: ReturnType<typeof buildDashboardData> }) {
  const subjectTimeData = evaluation.subjects.map((s) => ({
    name: s.name,
    value: Math.round(s.timeSpent / 60),
  }));

  return (
    <div className="space-y-6">
      {/* Subject Time */}
      <div className="manga-card manga-card--halftone">
        <h2 className="font-display text-2xl">Subject-wise Time</h2>
        <div className="mt-3">
          <SubjectTimeBar data={subjectTimeData} />
        </div>
      </div>

      {/* Time Quality */}
      <div className="manga-card">
        <h2 className="font-display text-2xl">Quality of Time Spent</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">How your time was distributed across correct, incorrect, and unattempted questions</p>
        <div className="mt-4">
          <SegmentedBar
            segments={[
              { label: "Correct", pct: dashboard.timeQuality.correctPct, color: "#21543c" },
              { label: "Incorrect", pct: dashboard.timeQuality.incorrectPct, color: "#c73e2a" },
              { label: "Unattempted", pct: dashboard.timeQuality.unattemptedPct, color: "#6f675e" },
            ]}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="border-2 border-[var(--moss)] bg-[var(--moss)]/5 p-2">
            <p className="font-display text-xl">{formatDuration(dashboard.timeQuality.correctTime)}</p>
            <p className="text-xs text-[var(--moss)]">On correct Qs</p>
          </div>
          <div className="border-2 border-[var(--vermilion)] bg-[var(--vermilion)]/5 p-2">
            <p className="font-display text-xl">{formatDuration(dashboard.timeQuality.incorrectTime)}</p>
            <p className="text-xs text-[var(--vermilion)]">On incorrect Qs</p>
          </div>
          <div className="border-2 border-[var(--muted)] bg-[var(--muted)]/5 p-2">
            <p className="font-display text-xl">{formatDuration(dashboard.timeQuality.unattemptedTime)}</p>
            <p className="text-xs text-[var(--muted)]">On skipped Qs</p>
          </div>
        </div>
      </div>

      {/* Time Journey Buckets */}
      <div className="manga-card overflow-x-auto">
        <h2 className="font-display text-2xl">Time Journey</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Performance across 30-minute intervals</p>
        <table className="manga-table mt-3 w-full min-w-[500px]">
          <thead>
            <tr>
              <th>Interval</th>
              <th>Attempted</th>
              <th>Correct</th>
              <th>Incorrect</th>
              <th>Unattempted</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.timeBuckets.map((bucket) => (
              <tr key={bucket.label}>
                <td className="font-semibold">{bucket.label}</td>
                <td>{bucket.attempted}</td>
                <td className="text-[var(--moss)]">{bucket.correct}</td>
                <td className="text-[var(--vermilion)]">{bucket.incorrect}</td>
                <td className="text-[var(--muted)]">{bucket.unattempted}</td>
                <td>{formatMarks(bucket.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== ATTEMPT ANALYSIS TAB ====================
function AttemptTab({ evaluation, dashboard }: { evaluation: Evaluation; dashboard: ReturnType<typeof buildDashboardData> }) {
  // Build subject-wise quality data
  const subjectNames = [...new Set(evaluation.questions.map((q) => q.canonicalSubject))];
  const qualityBySubject = subjectNames.map((subject) => {
    const row: Record<string, string | number> = { name: subject };
    for (const bucket of dashboard.attemptQuality) {
      row[bucket.label.split(" ")[0]!] = bucket.bySubject[subject] ?? 0;
    }
    return row;
  });

  const subjectChartData = subjectNames.map((subject) => ({
    name: subject,
    Perfect: dashboard.attemptQuality[0]!.bySubject[subject] ?? 0,
    Wasted: dashboard.attemptQuality[1]!.bySubject[subject] ?? 0,
    Overtime: dashboard.attemptQuality[2]!.bySubject[subject] ?? 0,
    Confused: dashboard.attemptQuality[3]!.bySubject[subject] ?? 0,
  }));

  return (
    <div className="space-y-6">
      {/* Quality Definitions */}
      <div className="grid gap-3 sm:grid-cols-2">
        {dashboard.attemptQuality.map((bucket) => (
          <article key={bucket.quality} className={cx("manga-card", `manga-card--quality-${bucket.quality}`)}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg">{bucket.label}</h3>
              <span className={cx("manga-badge", qualityBadgeClass(bucket.quality))}>{bucket.count}</span>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{bucket.description}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div><p className="font-display text-lg">{formatMarks(bucket.score)}</p><p>Score</p></div>
              <div><p className="font-display text-lg">{formatDuration(bucket.timeSpent)}</p><p>Time</p></div>
              <div><p className="font-display text-lg">{formatDuration(bucket.avgTime)}</p><p>Avg/Q</p></div>
            </div>
          </article>
        ))}
      </div>

      {/* Subject-wise Breakdown Chart */}
      <div className="manga-card">
        <h2 className="font-display text-2xl">Attempt Quality by Subject</h2>
        <div className="mt-3">
          <AttemptQualityChart data={subjectChartData} />
        </div>
      </div>

      {/* Subject-wise Table */}
      <div className="manga-card overflow-x-auto">
        <h2 className="font-display text-2xl">Subject-wise Breakdown</h2>
        <table className="manga-table mt-3 w-full min-w-[500px]">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Perfect</th>
              <th>Wasted</th>
              <th>Overtime</th>
              <th>Confused</th>
            </tr>
          </thead>
          <tbody>
            {qualityBySubject.map((row) => (
              <tr key={row.name as string}>
                <td className="font-semibold">{row.name as string}</td>
                <td className="text-[var(--moss)]">{row.Perfect as number}</td>
                <td className="text-[var(--vermilion)]">{row.Wasted as number}</td>
                <td className="text-[var(--gold)]">{row.Overtime as number}</td>
                <td className="text-[var(--muted)]">{row.Confused as number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== DIFFICULTY TAB ====================
function DifficultyTab({ evaluation, dashboard }: { evaluation: Evaluation; dashboard: ReturnType<typeof buildDashboardData> }) {
  const chartData = dashboard.difficulty.map((d) => ({
    name: d.level,
    Correct: d.correct,
    Wrong: d.incorrect,
    Unattempted: d.unattempted,
  }));

  return (
    <div className="space-y-6">
      <div className="manga-card">
        <h2 className="font-display text-2xl">Difficulty Distribution</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Questions classified by type, marks, and observed time</p>
        <div className="mt-4">
          <ClusteredBarChart
            data={chartData}
            bars={[
              { key: "Correct", name: "Correct", color: "#21543c" },
              { key: "Wrong", name: "Wrong", color: "#c73e2a" },
              { key: "Unattempted", name: "Unattempted", color: "#6f675e" },
            ]}
          />
        </div>
      </div>

      <div className="manga-card overflow-x-auto">
        <h2 className="font-display text-2xl">Difficulty Matrix</h2>
        <table className="manga-table mt-3 w-full min-w-[500px]">
          <thead>
            <tr>
              <th>Difficulty</th>
              <th>Total</th>
              <th>Correct</th>
              <th>Wrong</th>
              <th>Partial</th>
              <th>Unattempted</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.difficulty.map((row) => (
              <tr key={row.level}>
                <td className="font-semibold">
                  <span className={cx("manga-badge", difficultyBadgeClass(row.level))}>{row.level}</span>
                </td>
                <td>{row.total}</td>
                <td className="text-[var(--moss)]">{row.correct}</td>
                <td className="text-[var(--vermilion)]">{row.incorrect}</td>
                <td className="text-[var(--gold)]">{row.partial}</td>
                <td className="text-[var(--muted)]">{row.unattempted}</td>
                <td>{formatMarks(row.score)} / {formatMarks(row.maxMarks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== SUBJECT MOVEMENT TAB ====================
function SubjectMovementTab({ dashboard }: { dashboard: ReturnType<typeof buildDashboardData> }) {
  const hops = dashboard.subjectMovement;

  return (
    <div className="space-y-6">
      <div className="manga-card">
        <h2 className="font-display text-2xl">Subject Movement Timeline</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">How you hopped across sections during the test</p>
        {hops.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-0">
            {hops.map((hop, i) => (
              <div key={i} className="flex items-center">
                <div
                  className="subject-hop-chip"
                  style={{
                    borderColor: subjectColor(hop.subject),
                    backgroundColor: `${subjectColor(hop.subject)}15`,
                  }}
                >
                  <p className="text-xs font-bold" style={{ color: subjectColor(hop.subject) }}>{hop.subject}</p>
                  <p className="text-[10px] text-[var(--muted)]">{hop.section}</p>
                  <p className="mt-0.5 text-xs">{hop.questionCount} Qs · {formatDuration(hop.timeSpent)}</p>
                </div>
                {i < hops.length - 1 && (
                  <span className="mx-0.5 text-[var(--muted)]">→</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">No movement data available.</p>
        )}
      </div>

      {/* Summary Table */}
      {hops.length > 0 && (
        <div className="manga-card overflow-x-auto">
          <h2 className="font-display text-2xl">Movement Summary</h2>
          <table className="manga-table mt-3 w-full min-w-[400px]">
            <thead>
              <tr>
                <th>#</th>
                <th>Section</th>
                <th>Questions</th>
                <th>Time Spent</th>
                <th>Avg / Q</th>
              </tr>
            </thead>
            <tbody>
              {hops.map((hop, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="font-semibold">{hop.subject} · {hop.section}</td>
                  <td>{hop.questionCount}</td>
                  <td>{formatDuration(hop.timeSpent)}</td>
                  <td>{hop.questionCount > 0 ? formatDuration(Math.round(hop.timeSpent / hop.questionCount)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ==================== QUESTION JOURNEY TAB ====================
function QuestionJourneyTab({
  dashboard,
  evaluation,
  onJumpToQuestion,
}: {
  dashboard: ReturnType<typeof buildDashboardData>;
  evaluation: Evaluation;
  onJumpToQuestion: (qId: string) => void;
}) {
  const journey = dashboard.questionJourney;
  const painful = dashboard.painfulQuestions;

  return (
    <div className="space-y-6">
      {/* Journey Timeline */}
      <div className="manga-card">
        <h2 className="font-display text-2xl">Question Journey Timeline</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Chronological trace of question visits</p>
        {journey.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {journey.map((visit) => (
              <button
                key={visit.questionId}
                className={cx("journey-chip", journeyChipClass(visit.status))}
                onClick={() => onJumpToQuestion(visit.questionId)}
                title={`Q${visit.displayNumber} · ${visit.subject} · ${resultLabel(visit.status)} · ${formatDuration(visit.timeSpent)}`}
              >
                <span className="text-xs font-bold">Q{visit.displayNumber}</span>
                <span className="text-[10px]">{formatClock(visit.timeSpent)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">No journey data available.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 bg-[var(--moss)]" /> Correct</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 bg-[var(--vermilion)]" /> Incorrect</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 bg-[var(--gold)]" /> Partial</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 bg-[var(--muted)]" /> Unattempted</span>
        </div>
      </div>

      {/* Painful Questions */}
      {painful.length > 0 && (
        <div className="manga-card manga-card--painful">
          <h2 className="font-display text-2xl">🔥 Painful Questions</h2>
          <p className="mt-1 font-note text-sm text-[var(--vermilion)]">Questions where you spent excessive time but got negative marks or left blank</p>
          <div className="mt-3 space-y-2">
            {painful.map((pq) => (
              <button
                key={pq.questionId}
                className="painful-item w-full text-left"
                onClick={() => onJumpToQuestion(pq.questionId)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Q{pq.displayNumber} · {pq.subject} · {pq.section}</span>
                  <span className="manga-badge manga-badge--red">{formatMarks(pq.marks)} marks</span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">{pq.reason}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== QS BY QS TAB ====================
function QsByQsTab({
  evaluation,
  dashboard,
  onJumpToQuestion,
}: {
  evaluation: Evaluation;
  dashboard: ReturnType<typeof buildDashboardData>;
  onJumpToQuestion: (qId: string) => void;
}) {
  const [sortBy, setSortBy] = useState<"number" | "time" | "marks">("number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    const qs = [...evaluation.questions];
    qs.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "number") cmp = a.displayNumber - b.displayNumber;
      else if (sortBy === "time") cmp = a.timeSpent - b.timeSpent;
      else if (sortBy === "marks") cmp = a.marks - b.marks;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return qs;
  }, [evaluation, sortBy, sortDir]);

  function toggleSort(key: "number" | "time" | "marks") {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir("asc"); }
  }

  return (
    <div className="manga-card overflow-x-auto">
      <h2 className="font-display text-2xl">Question-by-Question Breakdown</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Click any row to view the full solution</p>
      <table className="manga-table mt-3 w-full min-w-[760px]">
        <thead>
          <tr>
            <th>
              <button className="sort-btn" onClick={() => toggleSort("number")}>
                Qs No {sortBy === "number" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </th>
            <th>Subject</th>
            <th>Section</th>
            <th>Type</th>
            <th>Difficulty</th>
            <th>
              <button className="sort-btn" onClick={() => toggleSort("time")}>
                Time {sortBy === "time" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </th>
            <th>Status</th>
            <th>
              <button className="sort-btn" onClick={() => toggleSort("marks")}>
                Marks {sortBy === "marks" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            </th>
            <th>Evaluation</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((q) => {
            const diff = dashboard.difficultyByQuestion.get(q.questionId);
            const quality = dashboard.attemptQualityByQuestion.get(q.questionId);
            return (
              <tr key={q.questionId} className="cursor-pointer hover:bg-[#fff8ee]" onClick={() => onJumpToQuestion(q.questionId)}>
                <td className="font-semibold">Q{q.displayNumber}</td>
                <td>{q.canonicalSubject}</td>
                <td>{q.section}</td>
                <td className="text-xs">{typeLabel(q.type)}</td>
                <td>{diff ? <span className={cx("manga-badge", difficultyBadgeClass(diff))}>{diff}</span> : "—"}</td>
                <td>{formatClock(q.timeSpent)}</td>
                <td><span className={cx("manga-badge", statusBadgeClass(q.status))}>{resultLabel(q.status)}</span></td>
                <td className="font-semibold">{formatMarks(q.marks)} / {formatMarks(q.maxMarks)}</td>
                <td className="text-xs">{quality ? qualityLabel(quality) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ==================== QUESTION REVIEW STEPPER ====================
function QuestionReviewStepper({
  test,
  attempt,
  evaluation,
  dashboard,
  urls,
  questions,
  currentIndex,
  filter,
  onIndexChange,
  onFilterChange,
  onClose,
  onExplain,
  busy,
  aiError,
  onJumpToQuestion,
}: {
  test: StoredTest;
  attempt: Attempt;
  evaluation: Evaluation;
  dashboard: ReturnType<typeof buildDashboardData>;
  urls: Record<string, string>;
  questions: QuestionAnalysis[];
  currentIndex: number;
  filter: ReviewFilter;
  onIndexChange: (index: number) => void;
  onFilterChange: (filter: ReviewFilter) => void;
  onClose: () => void;
  onExplain: (q: QuestionAnalysis) => void;
  busy: boolean;
  aiError: string;
  onJumpToQuestion: (qId: string) => void;
}) {
  const current = questions[currentIndex] ?? null;
  const [showPalette, setShowPalette] = useState(false);
  const [solutionOpen, setSolutionOpen] = useState(true);

  if (!current) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <button className="manga-btn mb-4" onClick={onClose}>← Back to Dashboard</button>
        <p className="text-sm text-[var(--muted)]">No questions match this filter.</p>
      </div>
    );
  }

  const diff = dashboard.difficultyByQuestion.get(current.questionId);
  const quality = dashboard.attemptQualityByQuestion.get(current.questionId);
  const explanation = attempt.explanations?.[current.questionId];

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      {/* Top Bar */}
      <div className="sticky top-0 z-20 border-b-[3px] border-black bg-[var(--card)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-2">
            <button className="manga-btn" onClick={onClose}>← Dashboard</button>
            <span className="font-note text-sm text-[var(--muted)]">Review Mode</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="manga-btn"
              disabled={currentIndex <= 0}
              onClick={() => onIndexChange(currentIndex - 1)}
            >
              ← Prev
            </button>
            <span className="font-display text-lg">
              {currentIndex + 1} / {questions.length}
            </span>
            <button
              className="manga-btn"
              disabled={currentIndex >= questions.length - 1}
              onClick={() => onIndexChange(currentIndex + 1)}
            >
              Next →
            </button>
            <button className="manga-btn" onClick={() => setShowPalette(!showPalette)}>
              {showPalette ? "Hide" : "Show"} Palette
            </button>
          </div>
        </div>
        {/* Filter bar */}
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-2">
          {REVIEW_FILTERS.map((f) => (
            <button
              key={f}
              className={cx("shrink-0 border-2 border-black px-2.5 py-1 text-xs font-semibold", filter === f ? "bg-black text-white" : "bg-white")}
              onClick={() => onFilterChange(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl gap-4 px-3 py-4">
        {/* Question Palette Sidebar */}
        {showPalette && (
          <aside className="hidden w-56 shrink-0 md:block">
            <div className="manga-card sticky top-28 max-h-[70vh] overflow-y-auto p-3">
              <h3 className="font-display text-lg">Question Palette</h3>
              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {questions.map((q, i) => (
                  <button
                    key={q.questionId}
                    className={cx("review-palette-btn", reviewPaletteClass(q.status), i === currentIndex && "review-palette-current")}
                    onClick={() => onIndexChange(i)}
                    title={`Q${q.displayNumber} · ${resultLabel(q.status)}`}
                  >
                    {q.displayNumber}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 bg-[var(--moss)]" /> Correct</div>
                <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 bg-[var(--vermilion)]" /> Incorrect</div>
                <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 bg-[var(--gold)]" /> Partial</div>
                <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 border border-dashed border-[var(--muted)]" /> Unattempted</div>
              </div>
            </div>
          </aside>
        )}

        {/* Main Content */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Question Header */}
          <div className="manga-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl">Question {current.displayNumber}</h2>
                <span className="manga-badge manga-badge--blue">{current.canonicalSubject}</span>
                <span className="manga-badge manga-badge--outline">{current.section}</span>
                <span className="manga-badge manga-badge--outline text-[10px]">{typeLabel(current.type)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {diff && <span className={cx("manga-badge", difficultyBadgeClass(diff))}>{diff}</span>}
                {quality && <span className={cx("manga-badge", qualityBadgeClass(quality))}>{qualityLabel(quality)}</span>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <span className={cx("manga-badge", statusBadgeClass(current.status))}>{resultLabel(current.status)}</span>
              <span className="font-note">⏱ {formatDuration(current.timeSpent)}</span>
              <span className="font-note">📊 {formatMarks(current.marks)} / {formatMarks(current.maxMarks)}</span>
            </div>
          </div>

          {/* Question Image & Content */}
          <div className="manga-card p-4">
            <div className="space-y-3">
              {current.imageIds.map((id) => (
                urls[id] ? (
                  <img key={id} src={urls[id]} alt={`Question ${current.displayNumber}`} className="mx-auto h-auto max-w-full" />
                ) : (
                  <p key={id} className="text-sm text-[var(--muted)]">Image missing from local storage.</p>
                )
              ))}
            </div>

            {/* Answer Comparison */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className={cx("answer-box", current.status === "correct" ? "answer-box--correct" : current.status === "incorrect" ? "answer-box--incorrect" : "answer-box--neutral")}>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Your Answer</p>
                <p className="font-display text-xl">{current.userLabel}</p>
              </div>
              <div className="answer-box answer-box--correct">
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Correct Answer</p>
                <p className="font-display text-xl">{current.correctLabel}</p>
              </div>
            </div>

            {current.topic || current.concept ? (
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                {current.topic && <span>📚 {current.topic}</span>}
                {current.concept && <span>💡 {current.concept}</span>}
              </div>
            ) : null}
          </div>

          {/* Solution Section */}
          <div className="manga-card manga-card--solution">
            <button
              className="flex w-full items-center justify-between p-4"
              onClick={() => setSolutionOpen(!solutionOpen)}
            >
              <h2 className="font-display text-2xl">📖 Step-by-Step Solution</h2>
              <span className="text-xl">{solutionOpen ? "▼" : "▶"}</span>
            </button>
            {solutionOpen && (
              <div className="border-t-2 border-dashed border-black p-4">
                {current.solution ? (
                  <RichText text={current.solution} />
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    This ZIP did not include a solution for this question. Use the AI tutor below or refer to your textbook.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* AI Tutor */}
          <div className="manga-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xl">🤖 AI Tutor Explanation</h3>
              <button
                className="manga-btn manga-btn-primary"
                disabled={busy}
                onClick={() => onExplain(current)}
              >
                {busy ? "Asking…" : "Explain with Gemini"}
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">Gemini can explain. It cannot change the key or the marks.</p>
            {aiError && <p className="mt-2 text-sm text-[var(--vermilion)]">{aiError}</p>}
            {explanation ? (
              <div className="mt-3">
                <RichText text={explanation} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== SHARED UI COMPONENTS ====================
function MangaStatCard({
  label,
  value,
  note,
  accent,
  badge,
}: {
  label: string;
  value: string;
  note: string;
  accent: "primary" | "gold" | "green" | "red" | "blue" | "muted";
  badge?: string;
}) {
  const accentClass = {
    primary: "manga-stat--primary",
    gold: "manga-stat--gold",
    green: "manga-stat--green",
    red: "manga-stat--red",
    blue: "manga-stat--blue",
    muted: "manga-stat--muted",
  }[accent];

  return (
    <article className={cx("manga-stat", accentClass)}>
      {badge && <span className="manga-stat-badge">{badge}</span>}
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{note}</p>
    </article>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" }) {
  return (
    <article className="manga-metric">
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={cx("mt-1 font-display text-xl", tone === "red" && "text-[var(--vermilion)]", tone === "green" && "text-[var(--moss)]")}>{value}</p>
    </article>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" | "muted" }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className={cx(
        "font-semibold",
        tone === "green" && "text-[var(--moss)]",
        tone === "red" && "text-[var(--vermilion)]",
        tone === "muted" && "text-[var(--muted)]",
      )}>{value}</dd>
    </div>
  );
}

// ==================== HELPER FUNCTIONS ====================
function difficultyBadgeClass(level: DifficultyLevel): string {
  if (level === "Easy") return "manga-badge--green";
  if (level === "Moderate") return "manga-badge--gold";
  return "manga-badge--red";
}

function statusBadgeClass(status: string): string {
  if (status === "correct" || status === "bonus") return "manga-badge--green";
  if (status === "incorrect") return "manga-badge--red";
  if (status === "partial") return "manga-badge--gold";
  if (status === "dropped") return "manga-badge--blue";
  return "manga-badge--muted";
}

function qualityBadgeClass(quality: AttemptQuality): string {
  if (quality === "perfect") return "manga-badge--green";
  if (quality === "wasted") return "manga-badge--red";
  if (quality === "overtime") return "manga-badge--gold";
  return "manga-badge--muted";
}

function qualityLabel(quality: AttemptQuality): string {
  if (quality === "perfect") return "Perfect";
  if (quality === "wasted") return "Wasted";
  if (quality === "overtime") return "Overtime";
  return "Confused";
}

function journeyChipClass(status: string): string {
  if (status === "correct" || status === "bonus") return "journey-chip--correct";
  if (status === "incorrect") return "journey-chip--incorrect";
  if (status === "partial") return "journey-chip--partial";
  return "journey-chip--unattempted";
}

function reviewPaletteClass(status: string): string {
  if (status === "correct" || status === "bonus") return "review-palette--correct";
  if (status === "incorrect") return "review-palette--incorrect";
  if (status === "partial") return "review-palette--partial";
  return "review-palette--unattempted";
}

function subjectColor(subject: string): string {
  if (subject === "Physics") return "#1e3a5f";
  if (subject === "Chemistry") return "#c73e2a";
  if (subject === "Mathematics") return "#21543c";
  return "#a67c3d";
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
