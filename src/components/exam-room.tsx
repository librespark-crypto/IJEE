"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { answerIsEmpty, cx, formatClock, markingText, optionLabel, typeLabel } from "@/lib/format";
import { orderedQuestions, submitAttempt, visibleAnswer } from "@/lib/attempt";
import { getAttempt, getImages, getTest } from "@/lib/storage";
import type { Attempt, Question, StoredTest, UserAnswer } from "@/lib/types";
import { useStore } from "./store";

export function ExamRoom({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const { ready, putAttempt } = useStore();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [test, setTest] = useState<StoredTest | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const submitting = useRef(false);
  const testRef = useRef<StoredTest | null>(null);
  testRef.current = test;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      const loaded = await getAttempt(attemptId);
      if (!loaded) {
        if (!cancelled) setError("This attempt is not on this browser.");
        return;
      }
      if (loaded.status === "submitted") {
        router.replace(`/analysis/${loaded.id}`);
        return;
      }
      const paper = await getTest(loaded.testId);
      if (!paper) {
        if (!cancelled) setError("The imported paper for this attempt is missing.");
        return;
      }
      const imageIds = paper.questions.flatMap((question) => question.imageIds);
      const blobs = await getImages(imageIds);
      const nextUrls: Record<string, string> = {};
      for (const [id, blob] of blobs) {
        const url = URL.createObjectURL(blob);
        created.push(url);
        nextUrls[id] = url;
      }
      const current = loaded.responses[loaded.currentQuestionId];
      const resumed: Attempt = {
        ...loaded,
        questionOpenedAt: Date.now(),
        responses: current?.status === "notVisited"
          ? { ...loaded.responses, [current.questionId]: { ...current, status: "notAnswered" } }
          : loaded.responses,
      };
      if (!cancelled) {
        setTest(paper);
        setAttempt(resumed);
        setUrls(nextUrls);
      }
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not open the paper.");
    });
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [ready, attemptId, router]);

  useEffect(() => {
    if (!attempt || attempt.status !== "ongoing") return;
    const id = window.setInterval(() => {
      setAttempt((current) => {
        if (!current || current.status !== "ongoing") return current;
        const remaining = Math.max(0, current.remainingSeconds - 1);
        const next = { ...current, remainingSeconds: remaining, updatedAt: Date.now() };
        if (remaining === 0 && !submitting.current) window.setTimeout(() => void finish(next, true), 0);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [attempt?.id, attempt?.status]);

  useEffect(() => {
    if (!attempt) return;
    const id = window.setTimeout(() => void putAttempt(attempt), 350);
    return () => window.clearTimeout(id);
  }, [attempt, putAttempt]);

  const questions = useMemo(() => (test ? orderedQuestions(test) : []), [test]);
  const current = questions.find((question) => question.id === attempt?.currentQuestionId) ?? questions[0];
  const response = attempt && current ? attempt.responses[current.id] : undefined;
  const shown = attempt && current ? visibleAnswer(attempt, current.id) : null;
  const index = current ? questions.findIndex((question) => question.id === current.id) : 0;
  const section = test?.sections.find((item) => item.questionIds.includes(current?.id ?? ""));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!attempt || !current || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
      if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      } else if (!typing && event.key.toLowerCase() === "m") {
        markAndNext();
      } else if (!typing && event.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (!typing && /^[1-9]$/.test(event.key) && (current.type === "mcq" || current.type === "msq")) {
        toggleOption(Number(event.key));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function patch(updater: (currentAttempt: Attempt) => Attempt) {
    setAttempt((currentAttempt) => (currentAttempt ? updater(currentAttempt) : currentAttempt));
  }

  function flush(currentAttempt: Attempt, now = Date.now()) {
    const open = currentAttempt.responses[currentAttempt.currentQuestionId];
    if (!open) return currentAttempt;
    const elapsed = Math.max(0, Math.round((now - currentAttempt.questionOpenedAt) / 1000));
    return {
      ...currentAttempt,
      questionOpenedAt: now,
      updatedAt: now,
      responses: {
        ...currentAttempt.responses,
        [open.questionId]: { ...open, timeSpent: open.timeSpent + elapsed },
      },
    };
  }

  function goTo(id: string) {
    patch((currentAttempt) => {
      const flushed = flush(currentAttempt);
      const next = flushed.responses[id];
      if (!next) return flushed;
      const status = next.status === "notVisited" ? "notAnswered" : next.status;
      return {
        ...flushed,
        currentQuestionId: id,
        responses: { ...flushed.responses, [id]: { ...next, status } },
      };
    });
    setZoom(1);
  }

  function move(delta: number) {
    const next = questions[index + delta];
    if (next) goTo(next.id);
  }

  function writeAnswer(next: UserAnswer | null) {
    if (!current) return;
    patch((currentAttempt) => {
      const response = currentAttempt.responses[current.id];
      if (!response) return currentAttempt;
      if (currentAttempt.realExamSave) {
        return {
          ...currentAttempt,
          updatedAt: Date.now(),
          responses: { ...currentAttempt.responses, [current.id]: { ...response, pending: next } },
        };
      }
      const empty = answerIsEmpty(current.type, next);
      const marked = response.status === "marked" || response.status === "markedAnswered";
      const status = empty ? (marked ? "marked" : "notAnswered") : marked ? "markedAnswered" : "answered";
      return {
        ...currentAttempt,
        updatedAt: Date.now(),
        responses: {
          ...currentAttempt.responses,
          [current.id]: { ...response, answer: next, pending: next, status },
        },
      };
    });
  }

  function commit(mode: "save" | "mark") {
    if (!current || !attempt) return;
    patch((currentAttempt) => {
      const flushed = flush(currentAttempt);
      const response = flushed.responses[current.id];
      if (!response) return flushed;
      const chosen = currentAttempt.realExamSave ? response.pending ?? response.answer : response.answer;
      const empty = answerIsEmpty(current.type, chosen);
      const status = mode === "mark" ? (empty ? "marked" : "markedAnswered") : empty ? "notAnswered" : "answered";
      const updated: Attempt = {
        ...flushed,
        responses: {
          ...flushed.responses,
          [current.id]: { ...response, answer: empty ? null : chosen, pending: empty ? null : chosen, status },
        },
      };
      const next = questions[index + 1];
      if (!next) return updated;
      const nextResponse = updated.responses[next.id];
      return {
        ...updated,
        currentQuestionId: next.id,
        responses: {
          ...updated.responses,
          [next.id]: { ...nextResponse, status: nextResponse.status === "notVisited" ? "notAnswered" : nextResponse.status },
        },
      };
    });
  }

  function markAndNext() {
    commit("mark");
  }

  function clearResponse() {
    if (!current) return;
    patch((currentAttempt) => {
      const response = currentAttempt.responses[current.id];
      if (!response) return currentAttempt;
      const marked = response.status === "marked" || response.status === "markedAnswered";
      return {
        ...currentAttempt,
        responses: {
          ...currentAttempt.responses,
          [current.id]: { ...response, answer: null, pending: null, status: marked ? "marked" : "notAnswered" },
        },
      };
    });
  }

  function toggleOption(option: number) {
    if (!current || option > Math.max(current.optionCount, current.msmCols)) return;
    if (current.type === "mcq") {
      const selected = shown?.kind === "mcq" ? shown.option : null;
      writeAnswer(selected === option ? null : { kind: "mcq", option });
      return;
    }
    if (current.type === "msq") {
      const selected = shown?.kind === "msq" ? shown.options : [];
      const options = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option];
      writeAnswer(options.length ? { kind: "msq", options } : null);
    }
  }

  function toggleMatrix(row: number, col: number) {
    const rows = shown?.kind === "msm" ? { ...shown.rows } : {};
    const key = String(row);
    const currentCols = rows[key] ?? [];
    rows[key] = currentCols.includes(col) ? currentCols.filter((item) => item !== col) : [...currentCols, col];
    writeAnswer({ kind: "msm", rows });
  }

  async function finish(source: Attempt, auto = false) {
    const paper = testRef.current;
    if (!paper || submitting.current) return;
    submitting.current = true;
    const submitted = submitAttempt(paper, source, auto);
    await putAttempt(submitted);
    router.push(`/analysis/${submitted.id}`);
  }

  if (error) {
    return <div className="grid min-h-screen place-items-center p-6 text-center"><p>{error}</p></div>;
  }
  if (!attempt || !test || !current || !response) {
    return <div className="grid min-h-screen place-items-center bg-[#0f3d73] text-white">Opening the paper…</div>;
  }

  const counts = countStatuses(attempt);
  const lowTime = attempt.remainingSeconds < 300;

  return (
    <div className="exam-shell flex min-h-screen flex-col">
      <header className="exam-top sticky top-0 z-20">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 md:px-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-blue-100">FJEE CBT</p>
            <h1 className="text-base font-semibold md:text-lg">{test.name}</h1>
          </div>
          <div className={cx("rounded px-3 py-1 text-center font-mono text-xl font-bold", lowTime ? "bg-red-600" : "bg-white/10")}>
            <span className="sr-only">Time remaining</span>
            {formatClock(attempt.remainingSeconds)}
          </div>
          <div className="flex items-center gap-2">
            <button className="border border-white/40 px-3 py-1 text-sm" onClick={() => setPaletteOpen((open) => !open)}>Palette</button>
            <button className="border border-white/40 px-3 py-1 text-sm" onClick={toggleFullscreen}>Fullscreen</button>
            <button className="bg-[#d6452f] px-3 py-1 text-sm font-semibold text-white" onClick={() => setConfirmOpen(true)}>Submit</button>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto bg-[#0c325e] px-3 py-2 text-white">
          {test.sections.map((item) => (
            <button
              key={`${item.subject}-${item.name}`}
              className={cx("shrink-0 px-3 py-1 text-sm", item.name === current.section ? "bg-white text-[#0f3d73]" : "text-blue-100")}
              onClick={() => goTo(item.questionIds[0]!)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-4 py-2 text-sm">
            <div>
              <span className="font-semibold">Question {attempt.displayNumbers[current.id]}</span>
              <span className="mx-2 text-slate-400">/</span>
              <span>{current.canonicalSubject}</span>
              <span className="mx-2 text-slate-400">·</span>
              <span>{typeLabel(current.type)}</span>
            </div>
            <p className="text-slate-600">{markingText(current)}</p>
          </div>
          {section?.instructionType && section.questionIds[0] === current.id ? (
            <p className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-950">
              Section instruction: {section.instructionType.replaceAll("-", " ")}
              {section.optionalQuestions ? ` · ${section.optionalQuestions} optional in this section` : ""}
            </p>
          ) : null}
          <div className="flex-1 overflow-auto bg-[#f7f8fa] p-3 md:p-6">
            <div className="mx-auto max-w-4xl bg-white p-3 shadow-sm md:p-5">
              <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                <span>Time on this question {formatClock(response.timeSpent + Math.max(0, Math.round((Date.now() - attempt.questionOpenedAt) / 1000)))}</span>
                <span className="flex gap-2">
                  <button className="border px-2 py-1" onClick={() => setZoom((value) => Math.max(0.6, round1(value - 0.2)))}>−</button>
                  <button className="border px-2 py-1" onClick={() => setZoom(1)}>Fit</button>
                  <button className="border px-2 py-1" onClick={() => setZoom((value) => Math.min(3, round1(value + 0.2)))}>+</button>
                </span>
              </div>
              <div className="space-y-3 overflow-auto">
                {current.imageIds.map((id) => (
                  <button key={id} className="block w-full" onClick={() => setLightbox(urls[id] ?? null)}>
                    {urls[id] ? (
                      <img src={urls[id]} alt="" className="mx-auto h-auto max-w-full" style={{ width: `${zoom * 100}%` }} />
                    ) : (
                      <span className="block border border-dashed p-8 text-sm text-slate-500">Question image unavailable.</span>
                    )}
                  </button>
                ))}
              </div>
              <AnswerControls
                question={current}
                answer={shown}
                onOption={toggleOption}
                onMatrix={toggleMatrix}
                onNat={(value) => writeAnswer(value.trim() ? { kind: "nat", value } : null)}
              />
              {attempt.realExamSave ? <p className="mt-3 text-xs text-slate-500">Real-exam save is on. The palette updates only after Save & Next or Mark for Review.</p> : null}
            </div>
          </div>
          <footer className="sticky bottom-0 grid grid-cols-2 gap-2 border-t bg-white p-3 md:grid-cols-4">
            <button className="border px-3 py-3 text-sm font-semibold" onClick={clearResponse}>Clear Response</button>
            <button className="border px-3 py-3 text-sm" onClick={() => move(-1)} disabled={index === 0}>Previous</button>
            <button className="bg-[#7a4ea3] px-3 py-3 text-sm font-semibold text-white" onClick={() => commit("mark")}>Mark for Review & Next</button>
            <button className="bg-[#0f3d73] px-3 py-3 text-sm font-semibold text-white" onClick={() => commit("save")}>Save & Next</button>
          </footer>
        </section>
        <aside className={cx("w-full border-l bg-white md:w-80", paletteOpen ? "fixed inset-0 z-30 md:static" : "hidden md:block")}>
          <div className="flex items-center justify-between border-b px-3 py-2 md:hidden">
            <strong>Question palette</strong>
            <button onClick={() => setPaletteOpen(false)}>Close</button>
          </div>
          <div className="max-h-[100vh] overflow-auto p-3">
            <Legend />
            {test.sections.map((item) => (
              <div key={`${item.subject}-${item.name}`} className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{item.name}</p>
                <div className="grid grid-cols-5 gap-2">
                  {item.questionIds.map((id) => {
                    const row = attempt.responses[id];
                    return (
                      <button
                        key={id}
                        className={cx("palette-btn", `q-${row?.status ?? "notVisited"}`, id === current.id && "q-current")}
                        onClick={() => {
                          goTo(id);
                          if (window.innerWidth < 768) setPaletteOpen(false);
                        }}
                      >
                        {attempt.displayNumbers[id]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>Answered {counts.answered + counts.markedAnswered}</div>
              <div>Not answered {counts.notAnswered}</div>
              <div>Marked {counts.marked + counts.markedAnswered}</div>
              <div>Not visited {counts.notVisited}</div>
            </dl>
          </div>
        </aside>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white p-5 shadow-xl">
            <h2 className="text-xl font-semibold">Submit this paper?</h2>
            <p className="mt-2 text-sm text-slate-600">Time left {formatClock(attempt.remainingSeconds)}. Answered {counts.answered + counts.markedAnswered}. Not answered {counts.notAnswered + counts.notVisited}. Marked {counts.marked + counts.markedAnswered}.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="border px-3 py-2" onClick={() => setConfirmOpen(false)}>Return</button>
              <button className="bg-[#0f3d73] px-3 py-2 text-white" onClick={() => void finish(attempt, false)}>Submit</button>
            </div>
          </div>
        </div>
      ) : null}
      {lightbox ? (
        <button className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-[92vh] max-w-[96vw] bg-white" />
        </button>
      ) : null}
    </div>
  );
}

function AnswerControls({
  question,
  answer,
  onOption,
  onMatrix,
  onNat,
}: {
  question: Question;
  answer: UserAnswer | null;
  onOption: (option: number) => void;
  onMatrix: (row: number, col: number) => void;
  onNat: (value: string) => void;
}) {
  if (question.type === "nat") {
    return (
      <label className="mt-5 block">
        <span className="text-sm font-semibold">Numerical answer</span>
        <input
          className="mt-1 w-full max-w-xs border-2 border-slate-700 px-3 py-2 font-mono text-lg"
          inputMode="decimal"
          value={answer?.kind === "nat" ? answer.value : ""}
          onChange={(event) => onNat(sanitizeNat(event.target.value))}
          placeholder="Enter value"
        />
      </label>
    );
  }
  if (question.type === "msm") {
    const rows = answer?.kind === "msm" ? answer.rows : {};
    return (
      <div className="mt-5 overflow-auto">
        <p className="mb-2 text-sm font-semibold">Matrix match — select every correct column in a row</p>
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2" />
              {Array.from({ length: question.msmCols }, (_, i) => (
                <th key={i} className="p-2">{optionLabel(i + 1, question.counterSecondary || "upper-pqrs")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: question.msmRows }, (_, row) => (
              <tr key={row}>
                <th className="p-2 text-left">{optionLabel(row + 1, question.counterPrimary)}</th>
                {Array.from({ length: question.msmCols }, (_, col) => {
                  const checked = (rows[String(row + 1)] ?? []).includes(col + 1);
                  return (
                    <td key={col} className="p-2 text-center">
                      <input type="checkbox" checked={checked} onChange={() => onMatrix(row + 1, col + 1)} aria-label={`Row ${row + 1} column ${col + 1}`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const selected = answer?.kind === "msq" ? answer.options : answer?.kind === "mcq" ? [answer.option] : [];
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 text-sm font-semibold">{question.type === "mcq" ? "Choose one option" : "Choose all correct options"}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: question.optionCount }, (_, i) => {
          const option = i + 1;
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={cx("flex items-center gap-3 border px-3 py-3 text-left", active ? "border-[#0f3d73] bg-blue-50" : "border-slate-300 bg-white")}
              onClick={() => onOption(option)}
            >
              <span className={cx("grid h-8 w-8 place-items-center border font-semibold", question.type === "mcq" ? "rounded-full" : "rounded-sm", active && "bg-[#0f3d73] text-white")}>
                {optionLabel(option, question.counterPrimary)}
              </span>
              <span className="text-sm">{question.type === "mcq" ? "Single correct" : "Multiple correct"}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Legend() {
  const items = [
    ["notVisited", "Not Visited"],
    ["notAnswered", "Not Answered"],
    ["answered", "Answered"],
    ["marked", "Marked"],
    ["markedAnswered", "Answered & Marked"],
  ] as const;
  return (
    <div className="mb-4 grid grid-cols-1 gap-1 text-xs">
      {items.map(([status, label]) => (
        <div key={status} className="flex items-center gap-2">
          <span className={cx("palette-btn", `q-${status}`)} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function countStatuses(attempt: Attempt) {
  const counts = { notVisited: 0, notAnswered: 0, answered: 0, marked: 0, markedAnswered: 0 };
  for (const response of Object.values(attempt.responses)) counts[response.status] += 1;
  return counts;
}

function sanitizeNat(value: string) {
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  const negative = cleaned.startsWith("-");
  const unsigned = cleaned.replace(/-/g, "");
  const [head, ...rest] = unsigned.split(".");
  return `${negative ? "-" : ""}${head ?? ""}${rest.length ? `.${rest.join("")}` : ""}`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}
