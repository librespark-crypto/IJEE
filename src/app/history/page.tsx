"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/store";
import { createAttempt } from "@/lib/attempt";
import { examLabel, formatDate, formatDuration, formatMarks, formatPercent } from "@/lib/format";

export default function HistoryPage() {
  const router = useRouter();
  const { attempts, tests, settings, putAttempt, removeAttempt } = useStore();

  async function retake(testId: string) {
    const test = tests.find((item) => item.id === testId);
    if (!test) return;
    const attempt = createAttempt(test, settings.numbering, settings.realExamSave);
    await putAttempt(attempt);
    router.push(`/exam/${attempt.id}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="font-note text-2xl text-[var(--vermilion)]">The old papers</p>
      <h1 className="font-display text-5xl">History</h1>
      <p className="mt-2 max-w-2xl text-sm">Every row is an attempt stored in this browser. Refresh does not clear it.</p>
      <div className="mt-6 overflow-x-auto border-[3px] border-[var(--ink)] bg-white">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-[#f6efe4] text-xs uppercase tracking-wide">
            <tr>{["Test", "Exam", "Date", "Score", "Accuracy", "Attempt", "Time", "P", "C", "M", ""].map((head) => <th key={head} className="px-3 py-2">{head}</th>)}</tr>
          </thead>
          <tbody>
            {attempts.map((attempt) => {
              const evaluation = attempt.evaluation;
              const subject = (name: string) => evaluation?.subjects.find((item) => item.name === name);
              const timeUsed = Math.max(0, attempt.durationSeconds - attempt.remainingSeconds);
              return (
                <tr key={attempt.id} className="border-t align-top">
                  <td className="px-3 py-3 font-semibold">{attempt.testName}</td>
                  <td className="px-3 py-3">{examLabel(attempt.examType)}</td>
                  <td className="px-3 py-3">{formatDate(attempt.submittedAt ?? attempt.updatedAt)}</td>
                  <td className="px-3 py-3">{attempt.status === "ongoing" ? "In progress" : evaluation?.scored ? `${formatMarks(evaluation.score)}/${formatMarks(evaluation.maxMarks)}` : "Unscored"}</td>
                  <td className="px-3 py-3">{evaluation?.scored ? formatPercent(evaluation.accuracy) : "—"}</td>
                  <td className="px-3 py-3">{evaluation ? formatPercent(evaluation.attemptRate) : "—"}</td>
                  <td className="px-3 py-3">{formatDuration(timeUsed)}</td>
                  <td className="px-3 py-3">{scoreOf(subject("Physics"))}</td>
                  <td className="px-3 py-3">{scoreOf(subject("Chemistry"))}</td>
                  <td className="px-3 py-3">{scoreOf(subject("Mathematics"))}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      {attempt.status === "submitted" ? <Link href={`/analysis/${attempt.id}`}>View analysis</Link> : <Link href={`/exam/${attempt.id}`}>Resume</Link>}
                      <button className="text-left" onClick={() => void retake(attempt.testId)}>Retake</button>
                      <button className="text-left text-[var(--vermilion)]" onClick={() => void removeAttempt(attempt.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {attempts.length === 0 ? <p className="p-6 text-sm">History is empty because no attempt has been stored yet.</p> : null}
      </div>
    </div>
  );
}

function scoreOf(subject?: { score: number; maxMarks: number; considered: number }) {
  if (!subject || !subject.considered) return "—";
  return `${formatMarks(subject.score)}/${formatMarks(subject.maxMarks)}`;
}
