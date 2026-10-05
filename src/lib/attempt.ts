import { answerIsEmpty } from "./format";
import { buildEvaluation } from "./evaluate";
import type { Attempt, AttemptResponse, NumberingMode, Question, QuestionType, StoredTest, UserAnswer } from "./types";

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
        pendingDirty: false,
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
  if (attempt.realExamSave && response.pendingDirty) return response.pending;
  return response.answer;
}

export function toggleChoiceAnswer(type: QuestionType, answer: UserAnswer | null, option: number): UserAnswer | null {
  if (!Number.isInteger(option) || option < 1) return answer;
  if (type === "single_correct") return { kind: "choice", options: [option] };
  if (type !== "multiple_correct" && type !== "objective") return answer;
  const selected = answer?.kind === "choice" ? [...new Set(answer.options)] : [];
  const next = selected.includes(option)
    ? selected.filter((item) => item !== option)
    : [...selected, option];
  return next.length ? { kind: "choice", options: next.sort((a, b) => a - b) } : null;
}

export function setAttemptAnswer(
  attempt: Attempt,
  questionId: string,
  type: QuestionType,
  next: UserAnswer | null,
  now = Date.now(),
): Attempt {
  const response = attempt.responses[questionId];
  if (!response || attempt.status !== "ongoing") return attempt;
  const normalizedNext = next?.kind === "choice"
    ? { kind: "choice" as const, options: [...new Set(next.options)].filter((option) => Number.isInteger(option) && option > 0).sort((a, b) => a - b) }
    : next;
  if (attempt.realExamSave) {
    return {
      ...attempt,
      updatedAt: now,
      responses: {
        ...attempt.responses,
        [questionId]: { ...response, pending: normalizedNext, pendingDirty: true },
      },
    };
  }
  const empty = answerIsEmpty(type, normalizedNext);
  const marked = response.status === "marked" || response.status === "markedAnswered";
  const status: AttemptResponse["status"] = empty ? (marked ? "marked" : "notAnswered") : marked ? "markedAnswered" : "answered";
  return {
    ...attempt,
    updatedAt: now,
    responses: {
      ...attempt.responses,
      [questionId]: {
        ...response,
        answer: empty ? null : normalizedNext,
        pending: empty ? null : normalizedNext,
        pendingDirty: false,
        status,
      },
    },
  };
}

export function flushOpenQuestion(attempt: Attempt, now = Date.now()): Attempt {
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

export function navigateAttempt(attempt: Attempt, questionId: string, now = Date.now()): Attempt {
  const flushed = flushOpenQuestion(attempt, now);
  const next = flushed.responses[questionId];
  if (!next) return flushed;
  const status: AttemptResponse["status"] = next.status === "notVisited" ? "notAnswered" : next.status;
  return {
    ...flushed,
    currentQuestionId: questionId,
    responses: { ...flushed.responses, [questionId]: { ...next, status } },
  };
}

export function clearAttemptAnswer(attempt: Attempt, questionId: string): Attempt {
  const response = attempt.responses[questionId];
  if (!response) return attempt;
  const marked = response.status === "marked" || response.status === "markedAnswered";
  const status: AttemptResponse["status"] = marked ? "marked" : "notAnswered";
  return {
    ...attempt,
    updatedAt: Date.now(),
    responses: {
      ...attempt.responses,
      [questionId]: {
        ...response,
        answer: null,
        pending: null,
        pendingDirty: false,
        status,
      },
    },
  };
}

export function commitQuestion(
  attempt: Attempt,
  question: Question,
  mode: "save" | "mark",
  nextQuestionId?: string,
  now = Date.now(),
): Attempt {
  const flushed = flushOpenQuestion(attempt, now);
  const response = flushed.responses[question.id];
  if (!response) return flushed;
  const chosen = attempt.realExamSave && response.pendingDirty ? response.pending : response.answer;
  const empty = answerIsEmpty(question.type, chosen);
  const status: AttemptResponse["status"] = mode === "mark"
    ? (empty ? "marked" : "markedAnswered")
    : empty ? "notAnswered" : "answered";
  const saved: AttemptResponse = {
    ...response,
    answer: empty ? null : chosen,
    pending: null,
    pendingDirty: false,
    status,
  };
  const responses = { ...flushed.responses, [question.id]: saved };
  const nextResponse = nextQuestionId ? responses[nextQuestionId] : undefined;
  if (!nextQuestionId || !nextResponse) return { ...flushed, responses };
  return {
    ...flushed,
    currentQuestionId: nextQuestionId,
    responses: {
      ...responses,
      [nextQuestionId]: {
        ...nextResponse,
        status: nextResponse.status === "notVisited" ? "notAnswered" : nextResponse.status,
      },
    },
  };
}

function commitPendingOnSubmit(test: StoredTest, attempt: Attempt): Record<string, AttemptResponse> {
  if (!attempt.realExamSave) return attempt.responses;
  const questions = new Map(test.questions.map((question) => [question.id, question]));
  const responses: Record<string, AttemptResponse> = {};
  for (const [questionId, response] of Object.entries(attempt.responses)) {
    if (!response.pendingDirty) {
      responses[questionId] = { ...response, pending: null, pendingDirty: false };
      continue;
    }
    const question = questions.get(questionId);
    if (!question) {
      responses[questionId] = { ...response, pending: null, pendingDirty: false };
      continue;
    }
    const answer = response.pending;
    const empty = answerIsEmpty(question.type, answer);
    const marked = response.status === "marked" || response.status === "markedAnswered";
    const status: AttemptResponse["status"] = empty ? (marked ? "marked" : "notAnswered") : marked ? "markedAnswered" : "answered";
    responses[questionId] = {
      ...response,
      answer: empty ? null : answer,
      pending: null,
      pendingDirty: false,
      status,
    };
  }
  return responses;
}

export function submitAttempt(test: StoredTest, attempt: Attempt, auto = false, now = Date.now()): Attempt {
  const flushed = flushOpenQuestion(attempt, now);
  const submitted: Attempt = {
    ...flushed,
    responses: commitPendingOnSubmit(test, flushed),
    status: "submitted",
    submittedAt: now,
    updatedAt: now,
    autoSubmitted: auto,
    remainingSeconds: auto ? 0 : flushed.remainingSeconds,
  };
  return { ...submitted, evaluation: buildEvaluation(test, submitted) };
}
