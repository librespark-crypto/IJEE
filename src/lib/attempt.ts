import { buildEvaluation } from "./evaluate";
import type { Attempt, NumberingMode, Question, StoredTest, UserAnswer } from "./types";

export function orderedQuestions(test: StoredTest) {
  const byId = new Map(test.questions.map((question) => [question.id, question]));
  const ordered: Question[] = [];
  for (const section of test.sections) {
    for (const id of section.questionIds) {
      const question = byId.get(id);
      if (question) ordered.push(question);
    }
  }
  return ordered.length ? ordered : test.questions;
}

export function displayNumbers(test: StoredTest, mode: NumberingMode) {
  const map: Record<string, number> = {};
  const ordered = orderedQuestions(test);
  if (mode === "original") {
    for (const question of ordered) map[question.id] = question.number;
    return map;
  }
  if (mode === "section-wise") {
    for (const section of test.sections) {
      section.questionIds.forEach((id, index) => {
        map[id] = index + 1;
      });
    }
    return map;
  }
  ordered.forEach((question, index) => {
    map[question.id] = index + 1;
  });
  return map;
}

export function createAttempt(test: StoredTest, numbering: NumberingMode, realExamSave: boolean, durationSeconds = test.durationSeconds): Attempt {
  const numbers = displayNumbers(test, numbering);
  const ordered = orderedQuestions(test);
  const now = Date.now();
  const responses = Object.fromEntries(
    test.questions.map((question) => [
      question.id,
      {
        questionId: question.id,
        answer: null,
        pending: null,
        status: "notVisited" as const,
        timeSpent: 0,
      },
    ]),
  );
  return {
    id: crypto.randomUUID(),
    testId: test.id,
    testName: test.name,
    examType: test.examType,
    kind: test.kind,
    status: "ongoing",
    startedAt: now,
    updatedAt: now,
    durationSeconds,
    remainingSeconds: durationSeconds,
    currentQuestionId: ordered[0]?.id ?? "",
    questionOpenedAt: now,
    numbering,
    realExamSave,
    displayNumbers: numbers,
    responses,
  };
}

export function visibleAnswer(attempt: Attempt, questionId: string): UserAnswer | null {
  const response = attempt.responses[questionId];
  if (!response) return null;
  if (attempt.realExamSave) return response.pending ?? response.answer;
  return response.answer;
}

export function flushOpenQuestion(attempt: Attempt, now = Date.now()) {
  const current = attempt.responses[attempt.currentQuestionId];
  if (!current || attempt.status !== "ongoing") return attempt;
  const elapsed = Math.max(0, Math.round((now - attempt.questionOpenedAt) / 1000));
  return {
    ...attempt,
    questionOpenedAt: now,
    updatedAt: now,
    responses: {
      ...attempt.responses,
      [current.questionId]: { ...current, timeSpent: current.timeSpent + elapsed },
    },
  };
}

export function submitAttempt(test: StoredTest, attempt: Attempt, auto = false): Attempt {
  const flushed = flushOpenQuestion(attempt);
  const submitted: Attempt = {
    ...flushed,
    status: "submitted",
    submittedAt: Date.now(),
    updatedAt: Date.now(),
    autoSubmitted: auto,
    remainingSeconds: auto ? 0 : flushed.remainingSeconds,
  };
  return { ...submitted, evaluation: buildEvaluation(test, submitted) };
}
