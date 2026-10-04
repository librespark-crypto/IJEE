"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/store";
import { createAttempt } from "@/lib/attempt";
import { examLabel, formatClock, kindLabel } from "@/lib/format";
import { cropPdfImages } from "@/lib/pdf-images";
import { applyAnswerKey, parseUpload } from "@/lib/pdf2cbt";
import type { AnswerKeyDraft, ExamType, ImportDraft, TestKind, ValidationItem } from "@/lib/types";

export default function PracticePage() {
  const router = useRouter();
  const { tests, settings, putTest, putAttempt, refresh } = useStore();
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [keyDraft, setKeyDraft] = useState<AnswerKeyDraft | null>(null);
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [examType, setExamType] = useState<ExamType>("jee-advanced");
  const [kind, setKind] = useState<TestKind>("full");
  const [minutes, setMinutes] = useState(180);

  const report = draft?.report ?? keyDraft?.report ?? [];
  const canStart = Boolean(draft && draft.blocking.length === 0 && draft.cropJobs.length === 0 && draft.test.questions.length);

  async function onFile(file: File) {
    setError("");
    setDraft(null);
    setKeyDraft(null);
    setBusy("Reading ZIP…");
    try {
      const parsed = await parseUpload(file);
      if (parsed.kind === "answer-key") {
        setKeyDraft(parsed);
        setTargetId(tests[0]?.id ?? "");
        setBusy("");
        return;
      }
      let next = parsed;
      if (parsed.cropJobs.length && parsed.pdfBytes) {
        setBusy(`Cropping 0 / ${parsed.cropJobs.length}`);
        const cropped = await cropPdfImages(parsed.pdfBytes, parsed.cropJobs, (done, total) => setBusy(`Cropping ${done} / ${total}`));
        const images = [...parsed.images];
        for (const [id, blob] of cropped.blobs) images.push({ id, blob });
        const missing = parsed.cropJobs.filter((job) => !cropped.blobs.has(job.imageId));
        const blocking = [...parsed.blocking, ...cropped.errors, ...missing.map((job) => `${job.label} could not be cropped.`)];
        const imageItem: ValidationItem = missing.length
          ? { label: "Images", status: "fail", detail: `${cropped.blobs.size} cropped, ${missing.length} failed.` }
          : { label: "Images", status: "pass", detail: `${images.length} question images ready.` };
        next = {
          ...parsed,
          images,
          cropJobs: [],
          pdfBytes: null,
          blocking,
          report: parsed.report.map((item) => (item.label === "Images" || item.label === "ZIP Validation" ? (item.label === "Images" ? imageItem : { ...item, status: blocking.length ? "fail" : "pass", detail: blocking.length ? blocking[0]! : "Passed" }) : item)),
        };
      }
      setDraft(next);
      setName(next.test.name);
      setExamType(next.test.examType);
      setKind(next.test.kind);
      setMinutes(Math.max(1, Math.round(next.test.durationSeconds / 60)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy("");
    }
  }

  async function save(start: boolean) {
    if (!draft) return;
    const test = {
      ...draft.test,
      name: name.trim() || draft.test.name,
      examType,
      kind,
      durationSeconds: Math.max(60, minutes * 60),
    };
    setBusy("Saving on this browser…");
    await putTest(test, draft.images);
    if (start) {
      const attempt = createAttempt(test, settings.numbering, settings.realExamSave, test.durationSeconds);
      await putAttempt(attempt);
      router.push(`/exam/${attempt.id}`);
    }
    setBusy("");
    if (!start) setDraft(null);
  }

  async function attachKey() {
    if (!keyDraft || !targetId) return;
    const test = tests.find((item) => item.id === targetId);
    if (!test) return;
    setBusy("Attaching answer key…");
    await putTest(applyAnswerKey(test, keyDraft.answers));
    await refresh();
    setBusy("Answer key attached. Open the test and retake, or re-open an analysis after a new attempt.");
    setKeyDraft(null);
  }

  const subjectLines = useMemo(() => draft?.report.filter((item) => ["Physics", "Chemistry", "Mathematics"].includes(item.label) || item.label === "Answer Key" || item.label === "Marking Scheme" || item.label === "ZIP Validation") ?? [], [draft]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="font-note text-2xl text-[var(--vermilion)]">Chapter 02 · The cropped paper</p>
      <h1 className="font-display text-5xl">Practice now</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6">Upload the ZIP PDF2CBT gave you. FJEE reads `data.json`, `questions.pdf`, and images named with `__--__`. It does not invent a different package format.</p>

      <label className="manga-panel mt-6 block cursor-pointer p-8 text-center">
        <span className="font-display text-3xl">Drop the ZIP</span>
        <span className="mt-2 block text-sm text-[var(--muted)]">.zip from Test Maker or Generate Answer Key. A lone answer-key JSON can be attached to a paper already on this browser.</span>
        <input className="mt-4 block w-full text-sm" type="file" accept=".zip,.json,application/zip,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file); }} />
      </label>
      {busy ? <p className="mt-3 font-note text-xl">{busy}</p> : null}
      {error ? <p className="mt-3 border-2 border-[var(--vermilion)] bg-white p-3 text-sm">{error}</p> : null}

      {report.length ? (
        <section className="mt-6 grid gap-2 sm:grid-cols-2">
          {(subjectLines.length ? subjectLines : report).map((item) => (
            <article key={item.label} className="border-2 border-[var(--ink)] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{item.label}</h2>
                <span className={item.status === "pass" ? "text-[var(--moss)]" : item.status === "warn" ? "text-[var(--gold)]" : "text-[var(--vermilion)]"}>{item.status === "pass" ? "✓" : item.status === "warn" ? "!" : "×"}</span>
              </div>
              <p className="mt-1 text-sm leading-6">{item.detail}</p>
            </article>
          ))}
        </section>
      ) : null}

      {draft ? (
        <section className="manga-panel mt-6 p-4">
          <h2 className="font-display text-3xl">Preview</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm">Test name<input className="mt-1 w-full border-2 border-[var(--ink)] bg-white px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="text-sm">Duration (minutes)<input className="mt-1 w-full border-2 border-[var(--ink)] bg-white px-3 py-2" type="number" min={1} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label>
            <label className="text-sm">Exam
              <select className="mt-1 w-full border-2 border-[var(--ink)] bg-white px-3 py-2" value={examType} onChange={(event) => setExamType(event.target.value as ExamType)}>
                <option value="jee-main">JEE Main</option>
                <option value="jee-advanced">JEE Advanced</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="text-sm">Kind
              <select className="mt-1 w-full border-2 border-[var(--ink)] bg-white px-3 py-2" value={kind} onChange={(event) => setKind(event.target.value as TestKind)}>
                <option value="full">Full test</option>
                <option value="part">Part test</option>
                <option value="practice">Practice</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-sm">{draft.test.questions.length} questions · detected {examLabel(draft.test.examType)} {kindLabel(draft.test.kind)} · numbering {settings.numbering}</p>
          {draft.blocking.length ? <ul className="mt-3 list-disc pl-5 text-sm text-[var(--vermilion)]">{draft.blocking.slice(0, 8).map((item) => <li key={item}>{item}</li>)}</ul> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="bg-[var(--ink)] px-4 py-2 text-white disabled:opacity-40" disabled={!canStart || Boolean(busy)} onClick={() => void save(true)}>Start test</button>
            <button className="border-2 border-[var(--ink)] px-4 py-2 disabled:opacity-40" disabled={draft.blocking.length > 0 || Boolean(busy)} onClick={() => void save(false)}>Save for later</button>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">A broken ZIP is not saved. Warnings, including a missing answer key, still let you practise.</p>
        </section>
      ) : null}

      {keyDraft ? (
        <section className="manga-panel mt-6 p-4">
          <h2 className="font-display text-3xl">Answer key only</h2>
          <p className="mt-2 text-sm">{keyDraft.keyed} answers. Choose the paper they belong to. Matching is by subject, section and original question number.</p>
          <select className="mt-3 w-full border-2 border-[var(--ink)] bg-white px-3 py-2" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            {tests.map((test) => <option key={test.id} value={test.id}>{test.name}</option>)}
          </select>
          <button className="mt-3 bg-[var(--ink)] px-4 py-2 text-white disabled:opacity-40" disabled={!targetId} onClick={() => void attachKey()}>Attach key</button>
        </section>
      ) : null}
      <p className="mt-6 text-xs text-[var(--muted)]">Timer preview for a 3-hour paper: {formatClock(10800)}. Nothing here is a demo paper — import your own ZIP.</p>
    </div>
  );
}
