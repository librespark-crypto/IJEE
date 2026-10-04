"use client";

import Link from "next/link";
import { TrendChart } from "@/components/charts";
import { useStore } from "@/components/store";
import { chaptersOf } from "@/lib/syllabus";
import { examLabel, formatDate, formatMarks, formatPercent } from "@/lib/format";

const CHAPTERS = [
  ["01", "Start", "A paper begins as a PDF. Crop it in PDF2CBT. Bring the ZIP here. No account stands between you and the timer."],
  ["02", "Practice", "Physics, Chemistry, Mathematics. Full papers, part papers, single-correct, MSQ, numerical, matrix. The palette does not flatter you."],
  ["03", "Analyze", "Marks come from the imported key and the marking scheme in the ZIP. Not from a model. Not from a guess."],
  ["04", "Improve", "Slow questions, fast guesses, the section that ate the clock. The insight names the question numbers."],
  ["05", "Master", "The 2026 official syllabi, still the latest published for the 2027 cycle, tracked topic by topic."],
];

export default function HomePage() {
  const { ready, tests, attempts, progress } = useStore();
  const ongoing = attempts.find((attempt) => attempt.status === "ongoing");
  const submitted = attempts.filter((attempt) => attempt.status === "submitted" && attempt.evaluation);
  const recent = submitted.slice(0, 5);
  const trend = recent.slice().reverse().map((attempt, index) => ({ name: `#${index + 1}`, value: attempt.evaluation?.percentage ?? 0 }));
  const weak = weakAreas(submitted);
  const syllabus = syllabusSnapshot(progress);

  return (
    <div className="paper-grain">
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:py-12">
        <div>
          <p className="font-note text-2xl text-[var(--vermilion)]">Volume 01 — a JEE paper, not a dashboard</p>
          <h1 className="mt-2 font-display text-5xl leading-[0.95] md:text-7xl">The answer sheet does not negotiate.</h1>
          <div className="speech mt-6 max-w-xl">
            <p className="font-note text-2xl leading-snug">Mira did not need another motivational banner. She needed the cropped question, the countdown, and a mark that could be checked by hand.</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/practice" className="bg-[var(--vermilion)] px-5 py-3 font-semibold text-white">Import a PDF2CBT ZIP</Link>
            <Link href={ongoing ? `/exam/${ongoing.id}` : "/tests"} className="border-[3px] border-[var(--ink)] bg-white px-5 py-3 font-semibold">
              {ongoing ? "Continue the open paper" : "Open the test shelf"}
            </Link>
          </div>
          <p className="mt-4 max-w-lg text-sm leading-6 text-[var(--muted)]">Local-first. The ZIP, the attempt, the score and the syllabus progress stay in this browser. No Google login. Gemini is optional and never writes the answer key.</p>
        </div>
        <figure className="manga-panel overflow-hidden">
          <img src="/images/mira.jpg" alt="Manga illustration of a student holding a blank exam booklet" className="h-full max-h-[640px] w-full object-cover" />
          <figcaption className="flex items-center justify-between border-t-[3px] border-[var(--ink)] px-3 py-2 text-sm">
            <span className="font-note text-lg">Panel 01 · Mira, before the bell</span>
            <span className="stamp">ink</span>
          </figcaption>
        </figure>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-8">
        <img src="/images/journey.jpg" alt="Five manga panels: notebook, cropping, clock, chart, school gate" className="manga-panel w-full" />
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {CHAPTERS.map(([num, title, copy]) => (
            <article key={num} className="border-[3px] border-[var(--ink)] bg-[#fffaf3] p-3">
              <p className="font-note text-xl text-[var(--vermilion)]">{num}</p>
              <h2 className="font-display text-2xl">{title}</h2>
              <p className="mt-2 text-sm leading-6">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-12 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="manga-panel overflow-hidden">
          <img src="/images/desk.jpg" alt="Manga study desk at night with a blank exam screen" className="h-64 w-full object-cover" />
          <div className="p-4">
            <h2 className="font-display text-3xl">How a paper enters FJEE</h2>
            <ol className="mt-3 space-y-2 text-sm leading-6">
              <li>1. Crop the question paper in PDF2CBT. Download the ZIP — `data.json` plus `questions.pdf`, or pre-generated PNGs named `Section__--__Q__--__1.png`.</li>
              <li>2. Import it here. The parser reads subjects, sections, types, marks, optional-question rules and both answer-key formats.</li>
              <li>3. Sit the CBT. Save & Next, Mark for Review, palette, timer, fullscreen.</li>
              <li>4. Submit. The evaluation engine scores single-correct, MSQ, numerical and matrix separately.</li>
            </ol>
          </div>
        </article>
        <article className="manga-panel p-4">
          <h2 className="font-display text-3xl">The desk</h2>
          {!ready ? <p className="mt-3 text-sm">Checking this browser’s shelf…</p> : null}
          <div className="mt-4 space-y-4">
            <DeskRow title="Continue test" body={ongoing ? `${ongoing.testName} · ${formatClockSafe(ongoing.remainingSeconds)} left` : "No paper is open."} href={ongoing ? `/exam/${ongoing.id}` : "/practice"} />
            <div>
              <h3 className="font-semibold">Recent tests</h3>
              {recent.length === 0 ? <p className="text-sm text-[var(--muted)]">Nothing submitted yet.</p> : recent.map((attempt) => (
                <Link key={attempt.id} href={`/analysis/${attempt.id}`} className="mt-2 block border border-[var(--ink)]/20 px-3 py-2 text-sm hover:bg-white">
                  <span className="font-semibold">{attempt.testName}</span>
                  <span className="mt-1 block text-[var(--muted)]">{formatDate(attempt.submittedAt ?? attempt.updatedAt)} · {attempt.evaluation?.scored ? `${formatMarks(attempt.evaluation.score)} / ${formatMarks(attempt.evaluation.maxMarks)}` : "Unscored"} · {examLabel(attempt.examType)}</span>
                </Link>
              ))}
            </div>
            <div>
              <h3 className="font-semibold">Syllabus progress</h3>
              <p className="text-sm">{syllabus.touched} of {syllabus.total} topics touched · {syllabus.strong} marked strong</p>
              <div className="mt-2 h-3 border-2 border-[var(--ink)]"><div className="h-full bg-[var(--moss)]" style={{ width: `${syllabus.percent}%` }} /></div>
            </div>
            <div>
              <h3 className="font-semibold">Weak areas</h3>
              {weak.length === 0 ? <p className="text-sm text-[var(--muted)]">Weak areas appear after a scored attempt. Nothing is fabricated.</p> : (
                <ul className="mt-1 text-sm">{weak.map((item) => <li key={item}>{item}</li>)}</ul>
              )}
            </div>
            <div>
              <h3 className="font-semibold">Recent score trend</h3>
              <TrendChart data={trend} label="Score %" />
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

function DeskRow({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <Link href={href} className="block border-2 border-[var(--ink)] bg-white px-3 py-3">
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{title}</span>
      <span className="mt-1 block font-semibold">{body}</span>
    </Link>
  );
}

function formatClockSafe(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function weakAreas(attempts: { evaluation?: { subjects: { name: string; accuracy: number; considered: number }[] } }[]) {
  const totals = new Map<string, { correctish: number; considered: number }>();
  for (const attempt of attempts) {
    for (const subject of attempt.evaluation?.subjects ?? []) {
      if (subject.considered < 3) continue;
      const row = totals.get(subject.name) ?? { correctish: 0, considered: 0 };
      row.correctish += subject.accuracy * subject.considered;
      row.considered += subject.considered;
      totals.set(subject.name, row);
    }
  }
  return [...totals.entries()]
    .map(([name, row]) => ({ name, accuracy: row.correctish / row.considered }))
    .filter((row) => row.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3)
    .map((row) => `${row.name} accuracy ${row.accuracy.toFixed(1)}% across scored attempts`);
}

function syllabusSnapshot(progress: { status: string }[]) {
  const total = (["Physics", "Chemistry", "Mathematics"] as const).reduce(
    (sum, subject) => sum + chaptersOf(subject).reduce((count, chapter) => count + chapter.topics.length, 0),
    0,
  );
  const touched = progress.filter((item) => item.status !== "not_started").length;
  const strong = progress.filter((item) => item.status === "strong").length;
  return { total, touched, strong, percent: total ? Math.round((touched / total) * 100) : 0 };
}
