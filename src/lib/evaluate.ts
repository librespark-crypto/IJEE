import {
  answerIsEmpty,
  formatOfficialAnswer,
  formatUserAnswer,
  questionMaxMarks,
  round2,
} from "./format";
import type {
  Attempt,
  AttemptResponse,
  BucketStats,
  Evaluation,
  Insight,
  OfficialAnswer,
  Question,
  QuestionAnalysis,
  QuestionResult,
  ResultStatus,
  StoredTest,
  UserAnswer,
} from "./types";

/**
 * Deterministic marker.
 * Ported from TheMoonVyy/pdf2cbt `utilGetQuestionResult` plus the optional-question
 * pass in results.vue. Gemini is never consulted. Question type, not the shape of
 * the response, decides single-correct vs MSQ vs numerical vs matrix.
 */

function positive(n: number | undefined, fallback = 0) {
  return Math.abs(n ?? fallback);
}

function natMatches(userRaw: string, keyRaw: string) {
  const user = parseFloat(userRaw);
  if (Number.isNaN(user)) return false;
  const parts = keyRaw
    .toUpperCase()
    .replaceAll("OR", ",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (part.includes("TO")) {
      const [lowRaw, highRaw] = part.split("TO");
      const low = parseFloat((lowRaw ?? "").trim());
      const high = parseFloat((highRaw ?? "").trim());
      if (!Number.isNaN(low) && !Number.isNaN(high) && user >= Math.min(low, high) && user <= Math.max(low, high)) {
        return true;
      }
    } else if (parseFloat(part) === user) {
      return true;
    }
  }
  return false;
}

function setsEqual(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  if (left.size !== new Set(b).size) return false;
  return b.every((n) => left.has(n));
}

function scoreChoice(
  type: Question["type"],
  user: UserAnswer | null,
  key: OfficialAnswer,
  cm: number,
  pm: number,
  im: number,
  partialMarkingConfigured: boolean,
): Pick<QuestionResult, "status" | "marks" | "accuracyNumerator"> {
  if (key.kind !== "choice" || user?.kind !== "choice") {
    return { status: "incorrect", marks: im, accuracyNumerator: 0 };
  }
  const selected = [...new Set(user.options)];
  const correct = [...new Set(key.values)];
  if (type === "single_correct") {
    const exact = selected.length === 1 && correct.length === 1 && setsEqual(selected, correct);
    return exact
      ? { status: "correct", marks: cm, accuracyNumerator: 1 }
      : { status: "incorrect", marks: im, accuracyNumerator: 0 };
  }
  if (type !== "multiple_correct") {
    return { status: "incorrect", marks: im, accuracyNumerator: 0 };
  }
  if (setsEqual(selected, correct)) {
    return { status: "correct", marks: cm, accuracyNumerator: 1 };
  }
  const isPartialSubset =
    partialMarkingConfigured &&
    selected.length > 0 &&
    selected.length < correct.length &&
    selected.every((option) => correct.includes(option));
  if (isPartialSubset) {
    const ratio = correct.length ? selected.length / correct.length : 0;
    return {
      status: "partial",
      marks: round2(pm * selected.length),
      accuracyNumerator: Math.round(ratio * 100) / 100,
    };
  }
  return { status: "incorrect", marks: im, accuracyNumerator: 0 };
}

function scoreMsm(
  user: UserAnswer | null,
  key: OfficialAnswer,
  cm: number,
  im: number,
): Pick<QuestionResult, "status" | "marks" | "accuracyNumerator"> {
  if (key.kind !== "msm" || user?.kind !== "msm") {
    return { status: "incorrect", marks: im, accuracyNumerator: 0 };
  }
  const userRows = Object.entries(user.rows).filter(([, cols]) => cols.length > 0);
  const correctRows = Object.entries(key.rows).filter(([, cols]) => cols.length > 0);
  const correctMap = Object.fromEntries(correctRows);
  const rowStatuses = new Set<ResultStatus>();
  let marks = 0;
  let matched = 0;
  for (const [row, cols] of userRows) {
    const expected = correctMap[row];
    if (expected && setsEqual(expected, cols)) {
      marks += cm;
      matched += 1;
      rowStatuses.add("correct");
    } else {
      marks += im;
      rowStatuses.add("incorrect");
    }
  }
  let status: ResultStatus = "incorrect";
  if (rowStatuses.size === 1) status = [...rowStatuses][0] ?? "incorrect";
  else if (rowStatuses.size > 1) status = "partial";
  const denom = correctRows.length || 1;
  const accuracyNumerator =
    status === "correct" ? 1 : status === "partial" ? Math.round((matched / denom) * 100) / 100 : 0;
  return { status, marks: round2(marks), accuracyNumerator };
}

export function evaluateQuestion(q: Question, response: AttemptResponse): QuestionResult {
  const cm = positive(q.marks.cm);
  const pm = positive(q.marks.pm);
  const partialMarkingConfigured = typeof q.marks.pm === "number" && q.marks.pm > 0;
  const im = -positive(q.marks.im);
  const maxMarks = questionMaxMarks(q);
  const base: QuestionResult = {
    questionId: q.id,
    status: "notAnswered",
    marks: 0,
    maxMarks,
    accuracyNumerator: 0,
    missingKey: q.correctAnswer.kind === "missing",
  };

  if (q.correctAnswer.kind === "dropped") {
    return { ...base, status: "dropped", marks: maxMarks || cm, missingKey: false };
  }
  if (q.correctAnswer.kind === "missing") {
    return { ...base, status: "notConsidered", marks: 0, maxMarks: 0, missingKey: true };
  }

  const attempted = response.status === "answered" || response.status === "markedAnswered";
  if (!attempted || answerIsEmpty(q.type, response.answer)) {
    return base;
  }

  if (q.correctAnswer.kind === "bonus") {
    return { ...base, status: "bonus", marks: maxMarks || cm, accuracyNumerator: 1, missingKey: false };
  }

  if (q.type === "numerical") {
    const raw = response.answer?.kind === "nat" ? response.answer.value : "";
    const key = q.correctAnswer.kind === "nat" ? q.correctAnswer.raw : "";
    if (natMatches(raw, key)) {
      return { ...base, status: "correct", marks: cm, accuracyNumerator: 1 };
    }
    return { ...base, status: "incorrect", marks: im };
  }

  if (q.type === "matrix_match") {
    const scored = scoreMsm(response.answer, q.correctAnswer, cm, im);
    return { ...base, ...scored };
  }

  // Both objective modes use an option set; the normalized question type alone
  // determines whether it must contain exactly one or the complete correct set.
  const scored = scoreChoice(q.type, response.answer, q.correctAnswer, cm, pm, im, partialMarkingConfigured);
  return { ...base, ...scored };
}

function keepPriority(q: Question, response: AttemptResponse) {
  if (q.correctAnswer.kind === "dropped" || q.correctAnswer.kind === "bonus") return 0;
  if (response.status === "answered" || response.status === "markedAnswered") return 1;
  return 2;
}

export function applyOptionalQuestions(test: StoredTest, results: QuestionResult[], responses: Record<string, AttemptResponse>) {
  const byId = new Map(results.map((result) => [result.questionId, result]));
  const questions = new Map(test.questions.map((q) => [q.id, q]));
  for (const section of test.sections) {
    const optional = section.optionalQuestions || 0;
    if (optional <= 0) continue;
    const rows = section.questionIds
      .map((id) => {
        const question = questions.get(id);
        const result = byId.get(id);
        const response = responses[id];
        if (!question || !result || !response) return null;
        return { question, result, response };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    rows.sort((a, b) => {
      const rank = keepPriority(a.question, a.response) - keepPriority(b.question, b.response);
      if (rank !== 0) return rank;
      return a.question.number - b.question.number;
    });
    const start = Math.max(0, rows.length - optional);
    for (let i = start; i < rows.length; i += 1) {
      const result = rows[i]!.result;
      result.status = "notConsidered";
      result.marks = 0;
      result.maxMarks = 0;
      result.accuracyNumerator = 0;
    }
  }
  return results;
}

function emptyBucket(name: string): BucketStats {
  return {
    name,
    score: 0,
    maxMarks: 0,
    percentage: 0,
    accuracy: 0,
    attemptRate: 0,
    correct: 0,
    incorrect: 0,
    partial: 0,
    unattempted: 0,
    dropped: 0,
    bonus: 0,
    notConsidered: 0,
    attempted: 0,
    considered: 0,
    timeSpent: 0,
    avgTime: 0,
    negativeMarks: 0,
  };
}

function finishBucket(bucket: BucketStats) {
  const judged = bucket.correct + bucket.incorrect + bucket.partial;
  bucket.score = round2(bucket.score);
  bucket.maxMarks = round2(bucket.maxMarks);
  bucket.negativeMarks = round2(bucket.negativeMarks);
  bucket.percentage = bucket.maxMarks ? round2((bucket.score / bucket.maxMarks) * 100) : 0;
  bucket.accuracy = judged ? round2((bucket.correct / judged) * 100) : 0;
  bucket.attemptRate = bucket.considered ? round2((bucket.attempted / bucket.considered) * 100) : 0;
  bucket.avgTime = bucket.considered ? Math.round(bucket.timeSpent / bucket.considered) : 0;
  return bucket;
}

function addToBucket(bucket: BucketStats, row: QuestionAnalysis, attempted: boolean) {
  bucket.timeSpent += row.timeSpent;
  if (row.status === "notConsidered" || row.missingKey) {
    bucket.notConsidered += 1;
    return;
  }
  bucket.considered += 1;
  bucket.score += row.marks;
  bucket.maxMarks += row.maxMarks;
  if (row.marks < 0) bucket.negativeMarks += Math.abs(row.marks);
  if (attempted) bucket.attempted += 1;
  if (row.status === "correct") bucket.correct += 1;
  else if (row.status === "incorrect") bucket.incorrect += 1;
  else if (row.status === "partial") bucket.partial += 1;
  else if (row.status === "dropped") bucket.dropped += 1;
  else if (row.status === "bonus") bucket.bonus += 1;
  else bucket.unattempted += 1;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function buildInsights(questions: QuestionAnalysis[], subjects: BucketStats[]): Insight[] {
  const insights: Insight[] = [];
  const considered = questions.filter((q) => q.status !== "notConsidered" && !q.missingKey);
  const judged = considered.filter((q) => q.status === "correct" || q.status === "incorrect" || q.status === "partial");
  const attemptedTimes = judged.map((q) => q.timeSpent).filter((t) => t > 0);
  const med = median(attemptedTimes);
  const scoredSubjects = subjects.filter((s) => s.considered >= 3);

  if (scoredSubjects.length >= 2) {
    const ranked = [...scoredSubjects].sort((a, b) => b.accuracy - a.accuracy || b.percentage - a.percentage);
    const best = ranked[0]!;
    const worst = ranked[ranked.length - 1]!;
    insights.push({
      id: "strongest-subject",
      tone: "strong",
      title: `${best.name} is the strongest subject`,
      detail: `${best.accuracy.toFixed(1)}% accuracy, ${formatScore(best.score, best.maxMarks)}, ${best.correct} correct out of ${best.attempted} attempted.`,
      questionIds: [],
    });
    if (best.name !== worst.name) {
      const gap = round2(best.accuracy - worst.accuracy);
      const wrong = questions.filter((q) => q.canonicalSubject === worst.name && q.status === "incorrect");
      insights.push({
        id: "weakest-subject",
        tone: "weak",
        title: `${worst.name} is the weakest subject`,
        detail: `${worst.accuracy.toFixed(1)}% accuracy versus ${best.accuracy.toFixed(1)}% in ${best.name} (${gap} point gap). ${wrong.length} incorrect in ${worst.name}${sectionDriver(wrong)}.`,
        questionIds: wrong.map((q) => q.questionId),
      });
    }
  }

  const byType = new Map<string, QuestionAnalysis[]>();
  for (const q of judged) {
    const list = byType.get(q.type) ?? [];
    list.push(q);
    byType.set(q.type, list);
  }
  const typeRows = [...byType.entries()]
    .filter(([, rows]) => rows.length >= 3)
    .map(([type, rows]) => {
      const correct = rows.filter((q) => q.status === "correct").length;
      return { type, accuracy: (correct / rows.length) * 100, rows };
    })
    .sort((a, b) => a.accuracy - b.accuracy);
  if (typeRows.length >= 2 && typeRows[0]!.accuracy + 12 < typeRows[typeRows.length - 1]!.accuracy) {
    const weak = typeRows[0]!;
    insights.push({
      id: "weak-type",
      tone: "weak",
      title: `${labelType(weak.type)} is the weak question type`,
      detail: `${weak.accuracy.toFixed(1)}% accuracy across ${weak.rows.length} judged ${labelType(weak.type)} questions. This is not a single-correct scoring leak — the type was evaluated on its own rule.`,
      questionIds: weak.rows.filter((q) => q.status !== "correct").map((q) => q.questionId),
    });
  }

  const slowCut = Math.max(120, med * 2.2);
  const slow = considered
    .filter((q) => q.timeSpent >= slowCut && (q.status === "incorrect" || q.status === "partial" || q.status === "notAnswered"))
    .sort((a, b) => b.timeSpent - a.timeSpent)
    .slice(0, 6);
  if (slow.length) {
    insights.push({
      id: "slow",
      tone: "time",
      title: "Time sank into questions that did not pay",
      detail: `Median attempted time was ${Math.round(med)}s. These crossed ${Math.round(slowCut)}s and still came back incorrect, partial, or blank: ${listNumbers(slow)}.`,
      questionIds: slow.map((q) => q.questionId),
    });
  }

  const fastCut = Math.min(15, Math.max(8, med * 0.35));
  const guesses = judged
    .filter((q) => q.status === "incorrect" && q.timeSpent > 0 && q.timeSpent <= fastCut)
    .slice(0, 8);
  if (guesses.length >= 2) {
    insights.push({
      id: "guesses",
      tone: "guess",
      title: "Very fast incorrect answers look like guesses",
      detail: `${guesses.length} incorrect responses were marked in ${Math.round(fastCut)}s or less: ${listNumbers(guesses)}. Those are not solved attempts.`,
      questionIds: guesses.map((q) => q.questionId),
    });
  }

  const attemptRate = considered.length ? judged.length / considered.length : 0;
  const accuracy = judged.length ? judged.filter((q) => q.status === "correct").length / judged.length : 0;
  if (considered.length >= 8 && attemptRate >= 0.85 && accuracy < 0.45) {
    insights.push({
      id: "over-attempt",
      tone: "guess",
      title: "Attempt rate is high and accuracy is not",
      detail: `${Math.round(attemptRate * 100)}% of considered questions were attempted, but only ${Math.round(accuracy * 100)}% of those were fully correct. The paper was not being filtered.`,
      questionIds: judged.filter((q) => q.status === "incorrect").map((q) => q.questionId).slice(0, 12),
    });
  }

  const calc = judged.filter((q) => q.type === "numerical" && q.status === "incorrect" && q.timeSpent >= Math.max(40, med));
  if (calc.length) {
    insights.push({
      id: "calculation",
      tone: "calc",
      title: "Numericals that were worked and still wrong",
      detail: `${calc.length} numerical ${calc.length === 1 ? "question was" : "questions were"} attempted for at least ${Math.round(Math.max(40, med))}s and marked incorrect: ${listNumbers(calc)}. That pattern is calculation or approximation, not a blank.`,
      questionIds: calc.map((q) => q.questionId),
    });
  }

  const conceptual = judged.filter(
    (q) => (q.type === "single_correct" || q.type === "multiple_correct") && q.status === "incorrect" && q.timeSpent >= 45,
  );
  if (conceptual.length >= 2) {
    insights.push({
      id: "conceptual",
      tone: "concept",
      title: "Single and multiple-correct misses after real thinking time",
      detail: `${conceptual.length} MCQ/MSQ questions were incorrect after 45s or more: ${listNumbers(conceptual.slice(0, 8))}. These are conceptual or interpretation misses, not blink guesses.`,
      questionIds: conceptual.map((q) => q.questionId),
    });
  }

  const skip = judged.filter((q) => q.status === "incorrect" && q.marks < 0 && q.timeSpent >= 150);
  if (skip.length) {
    const blankWorth = considered.filter((q) => q.status === "notAnswered" && q.maxMarks >= 3);
    insights.push({
      id: "should-skip",
      tone: "skip",
      title: "Questions that should have been left",
      detail: `${listNumbers(skip)} cost negative marks after ${skip.map((q) => `${Math.round(q.timeSpent / 60)}m`).join(", ")} each. ${blankWorth.length} other considered questions worth 3+ were never attempted.`,
      questionIds: skip.map((q) => q.questionId),
    });
  }

  const timeHeavy = subjects
    .filter((s) => s.timeSpent > 0)
    .sort((a, b) => b.timeSpent - a.timeSpent)[0];
  const totalTime = subjects.reduce((sum, s) => sum + s.timeSpent, 0);
  if (timeHeavy && totalTime > 0 && timeHeavy.timeSpent / totalTime >= 0.45 && scoredSubjects.length >= 2) {
    const weakest = [...scoredSubjects].sort((a, b) => a.accuracy - b.accuracy)[0];
    if (weakest && weakest.name === timeHeavy.name) {
      insights.push({
        id: "time-subject",
        tone: "time",
        title: `${timeHeavy.name} took the clock and still scored worst`,
        detail: `${Math.round((timeHeavy.timeSpent / totalTime) * 100)}% of recorded question time went to ${timeHeavy.name}, which also has the lowest accuracy (${timeHeavy.accuracy.toFixed(1)}%).`,
        questionIds: [],
      });
    }
  }

  const bySection = new Map<string, QuestionAnalysis[]>();
  for (const q of judged) {
    const key = `${q.canonicalSubject} · ${q.section}`;
    const list = bySection.get(key) ?? [];
    list.push(q);
    bySection.set(key, list);
  }
  const sectionRows = [...bySection.entries()]
    .filter(([, rows]) => rows.length >= 3)
    .map(([name, rows]) => ({
      name,
      accuracy: (rows.filter((q) => q.status === "correct").length / rows.length) * 100,
      rows,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);
  if (sectionRows.length >= 2) {
    const top = sectionRows[0]!;
    const bottom = sectionRows[sectionRows.length - 1]!;
    insights.push({
      id: "section-strong",
      tone: "strong",
      title: `Highest accuracy section: ${top.name}`,
      detail: `${top.accuracy.toFixed(1)}% on ${top.rows.length} judged questions.`,
      questionIds: [],
    });
    if (top.name !== bottom.name) {
      insights.push({
        id: "section-weak",
        tone: "weak",
        title: `Weakest section: ${bottom.name}`,
        detail: `${bottom.accuracy.toFixed(1)}% on ${bottom.rows.length} judged questions. Topic tags are not invented — this is the section name from the ZIP.`,
        questionIds: bottom.rows.filter((q) => q.status !== "correct").map((q) => q.questionId),
      });
    }
  }

  if (!considered.length && questions.some((q) => q.missingKey)) {
    insights.push({
      id: "no-key",
      tone: "note",
      title: "No score was invented",
      detail: "The ZIP did not include an answer key. Time and attempt data are real. Marks stay blank until a PDF2CBT answer-key file is attached.",
      questionIds: [],
    });
  }

  return insights;
}

function formatScore(score: number, max: number) {
  return `${round2(score)} / ${round2(max)}`;
}

function labelType(type: string) {
  if (type === "single_correct") return "Single Correct";
  if (type === "multiple_correct") return "Multiple Correct";
  if (type === "numerical") return "Numerical Answer";
  if (type === "objective") return "Objective (type unknown)";
  return "Matrix Match";
}

function listNumbers(rows: QuestionAnalysis[]) {
  return rows.map((q) => `Q${q.displayNumber}`).join(", ");
}

function sectionDriver(wrong: QuestionAnalysis[]) {
  if (!wrong.length) return "";
  const counts = new Map<string, number>();
  for (const q of wrong) counts.set(q.section, (counts.get(q.section) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return "";
  return `, concentrated in ${top[0]} (${top[1]})`;
}

export function buildEvaluation(test: StoredTest, attempt: Attempt): Evaluation {
  const raw = test.questions.map((q) =>
    evaluateQuestion(q, attempt.responses[q.id] ?? {
      questionId: q.id,
      answer: null,
      pending: null,
      status: "notVisited",
      timeSpent: 0,
    }),
  );
  applyOptionalQuestions(test, raw, attempt.responses);
  const resultById = new Map(raw.map((row) => [row.questionId, row]));

  const questions: QuestionAnalysis[] = test.questions.map((q) => {
    const result = resultById.get(q.id)!;
    const response = attempt.responses[q.id];
    return {
      ...result,
      displayNumber: attempt.displayNumbers[q.id] ?? q.number,
      number: q.number,
      subject: q.subject,
      canonicalSubject: q.canonicalSubject,
      section: q.section,
      type: q.type,
      userLabel: formatUserAnswer(q, response?.answer ?? null),
      correctLabel: formatOfficialAnswer(q),
      timeSpent: response?.timeSpent ?? 0,
      marked: response?.status === "marked" || response?.status === "markedAnswered",
      solution: q.solution,
      topic: q.topic,
      concept: q.concept,
      imageIds: q.imageIds,
    };
  });

  const subjectNames = [...new Set(test.questions.map((q) => q.canonicalSubject))];
  const subjects = subjectNames.map((name) => emptyBucket(name));
  const subjectMap = new Map(subjects.map((s) => [s.name, s]));
  const sectionMap = new Map<string, BucketStats>();
  const typeMap = new Map<string, BucketStats>();
  const overall = emptyBucket("Overall");

  for (const row of questions) {
    const response = attempt.responses[row.questionId];
    const attempted = response?.status === "answered" || response?.status === "markedAnswered";
    addToBucket(overall, row, attempted);
    const subject = subjectMap.get(row.canonicalSubject);
    if (subject) addToBucket(subject, row, attempted);
    const sectionKey = `${row.canonicalSubject} · ${row.section}`;
    const section = sectionMap.get(sectionKey) ?? emptyBucket(row.section);
    sectionMap.set(sectionKey, section);
    addToBucket(section, row, attempted);
    const type = typeMap.get(row.type) ?? emptyBucket(labelType(row.type));
    typeMap.set(row.type, type);
    addToBucket(type, row, attempted);
  }

  const finishedSubjects = subjects.map(finishBucket);
  const finished = finishBucket(overall);
  const insights = buildInsights(questions, finishedSubjects);
  const slowQuestionIds = insights.find((item) => item.id === "slow")?.questionIds ?? [];
  const fastGuessIds = insights.find((item) => item.id === "guesses")?.questionIds ?? [];

  return {
    scored: questions.some((q) => !q.missingKey && q.status !== "notConsidered"),
    score: finished.score,
    maxMarks: finished.maxMarks,
    percentage: finished.percentage,
    accuracy: finished.accuracy,
    attemptRate: finished.attemptRate,
    correct: finished.correct,
    incorrect: finished.incorrect,
    partial: finished.partial,
    unattempted: finished.unattempted,
    dropped: finished.dropped,
    bonus: finished.bonus,
    notConsidered: finished.notConsidered,
    attempted: finished.attempted,
    considered: finished.considered,
    negativeMarks: finished.negativeMarks,
    totalTime: questions.reduce((sum, q) => sum + q.timeSpent, 0),
    avgTime: finished.avgTime,
    missingKeyCount: questions.filter((q) => q.missingKey).length,
    subjects: finishedSubjects,
    sections: [...sectionMap.values()].map(finishBucket),
    types: [...typeMap.values()].map(finishBucket),
    questions,
    insights,
    slowQuestionIds,
    fastGuessIds,
  };
}

export function evaluationScored(questions: QuestionAnalysis[]) {
  return questions.some((q) => !q.missingKey && q.status !== "notConsidered");
}
