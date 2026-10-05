import { optionIndex } from "./format";
import type {
  Attempt,
  AttemptResponse,
  OfficialAnswer,
  Question,
  QuestionType,
  StoredTest,
  UserAnswer,
} from "./types";

type MetadataType = QuestionType | null;
type RecordLike = Record<string, unknown>;

const ANSWER_FIELDS = ["correctAnswer", "answer", "value", "values", "answers", "key"] as const;
const TYPE_FIELDS = ["type", "questionType", "question_type", "answerType"] as const;

export function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordLike
    : null;
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Maps source labels to one canonical type. MCQ intentionally stays unresolved. */
export function questionTypeHint(raw: unknown): MetadataType {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (["nat", "numerical", "numeric", "numerical answer", "integer", "integer answer", "number answer"].includes(value)) {
    return "numerical";
  }
  if (["msm", "matrix", "matrix match", "match", "matrix matching"].includes(value)) {
    return "matrix_match";
  }
  if (["msq", "multiple", "multi", "multiple correct", "multi correct", "multiple select", "multiple selection"].includes(value)) {
    return "multiple_correct";
  }
  if (["scq", "single", "single correct", "single choice", "single select", "single selection"].includes(value)) {
    return "single_correct";
  }
  if (["mcq", "objective", "objective question", "choice", "multiple choice", "multiple choice question"].includes(value)) {
    return "objective";
  }
  if (["single_correct", "multiple_correct", "numerical", "matrix_match", "objective"].includes(raw.trim().toLowerCase())) {
    return raw.trim().toLowerCase() as QuestionType;
  }
  return null;
}

function extractPayload(raw: unknown) {
  let value = raw;
  let declaredType: unknown;
  let counterPrimary: string | undefined;
  for (let depth = 0; depth < 8; depth += 1) {
    const record = asRecord(value);
    if (!record) break;
    for (const field of TYPE_FIELDS) {
      if (declaredType == null && record[field] != null) {
        declaredType = record[field];
      }
    }
    const counter = asRecord(record.answerOptionsCounterType);
    if (!counterPrimary && typeof counter?.primary === "string" && counter.primary !== "default") {
      counterPrimary = counter.primary;
    }
    if (typeof record.kind === "string" && ["choice", "nat", "msm", "bonus", "dropped", "missing"].includes(record.kind)) {
      // Typed key variants carry more information than generic MCQ metadata.
      if (record.kind === "nat") declaredType = "numerical";
      else if (record.kind === "msm") declaredType = "matrix_match";
      break;
    }
    const field = ANSWER_FIELDS.find((name) => Object.hasOwn(record, name));
    if (!field) break;
    value = record[field];
  }
  return { value, declaredType, counterPrimary };
}

/** Keep answer-key-only JSON raw until it is paired with the question metadata. */
export function answerKeyEntry(raw: unknown) {
  const { declaredType } = extractPayload(raw);
  return {
    raw,
    ...(typeof declaredType === "string" ? { declaredType } : {}),
  };
}

function normalizeChoiceIndexes(values: number[], optionCount: number) {
  const hasZero = values.some((value) => value === 0);
  const normalized = values
    .map((value) => hasZero ? value + 1 : value)
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= optionCount);
  return [...new Set(normalized)].sort((a, b) => a - b);
}

function parseOptionTokens(value: unknown, optionCount: number, counterPrimary?: string): number[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    return normalizeChoiceIndexes([value], optionCount);
  }
  if (Array.isArray(value)) {
    const tokens = value.flatMap((item) => Array.isArray(item) ? item : [item]);
    const numbers: number[] = [];
    const labels: number[] = [];
    for (const token of tokens) {
      if (typeof token === "number" && Number.isFinite(token)) {
        numbers.push(token);
        continue;
      }
      if (typeof token !== "string") continue;
      const text = token.trim().replace(/^['"]|['"]$/g, "");
      if (/^[+-]?\d+(?:\.0+)?$/.test(text)) {
        numbers.push(Number(text));
        continue;
      }
      const mapped = optionIndex(text, counterPrimary);
      const fallback = mapped ?? optionIndex(text, "upper-latin");
      if (fallback != null) labels.push(fallback);
    }
    return [...new Set([...normalizeChoiceIndexes(numbers, optionCount), ...labels.filter((n) => n <= optionCount)])]
      .sort((a, b) => a - b);
  }

  if (typeof value !== "string") return [];
  let text = value.trim();
  if (!text) return [];

  // JSON array strings (for example `["A","C"]`) and JSON-encoded scalars.
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith('"') && text.endsWith('"'))) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed !== value) return parseOptionTokens(parsed, optionCount, counterPrimary);
    } catch {
      // PDF2CBT and hand-authored keys also use unquoted forms such as [A,C].
    }
  }
  text = text.replace(/^\[|\]$/g, "").replace(/^\(|\)$/g, "").trim();
  text = text.replace(/^['"]|['"]$/g, "").trim();
  if (!text) return [];

  const pieces = text
    .split(/\s*(?:,|;|\||\/|\bOR\b|\bAND\b)\s*/i)
    .flatMap((piece) => piece.trim().split(/\s+/))
    .map((piece) => piece.replace(/^['"([{]+|['"\])}]+$/g, "").trim())
    .filter(Boolean);
  const numeric: number[] = [];
  const labels: number[] = [];
  for (const piece of pieces) {
    if (/^[+-]?\d+(?:\.0+)?$/.test(piece)) {
      numeric.push(Number(piece));
      continue;
    }
    const mapped = optionIndex(piece, counterPrimary);
    const fallback = mapped ?? optionIndex(piece, "upper-latin");
    if (fallback != null) labels.push(fallback);
  }
  return [...new Set([...normalizeChoiceIndexes(numeric, optionCount), ...labels.filter((n) => n <= optionCount)])]
    .sort((a, b) => a - b);
}

function numericalText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    if ((text.startsWith("[") && text.endsWith("]"))) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (Array.isArray(parsed)) return numericalText(parsed);
      } catch {
        // Keep a range/list written in plain text below.
      }
    }
    return text;
  }
  if (Array.isArray(value)) {
    const values = value.map((item) => {
      const range = asRecord(item);
      const min = finiteNumber(range?.min);
      const max = finiteNumber(range?.max);
      if (min != null && max != null) return `${min}TO${max}`;
      return String(item);
    });
    return values.length ? values.join(",") : null;
  }
  const record = asRecord(value);
  if (record) {
    const min = finiteNumber(record.min);
    const max = finiteNumber(record.max);
    if (min != null && max != null) return `${min}TO${max}`;
  }
  return null;
}

function matrixRows(value: unknown): Record<string, number[]> | null {
  const record = asRecord(value);
  if (!record) return null;
  const rows = asRecord(record.rows) ?? record;
  const result: Record<string, number[]> = {};
  for (const [row, columns] of Object.entries(rows)) {
    if (!Array.isArray(columns)) continue;
    const values = columns.map(finiteNumber).filter((n): n is number => n != null && Number.isInteger(n) && n > 0);
    result[String(row)] = [...new Set(values)].sort((a, b) => a - b);
  }
  const ordered = Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => {
      const leftNumber = finiteNumber(left);
      const rightNumber = finiteNumber(right);
      return leftNumber != null && rightNumber != null ? leftNumber - rightNumber : left.localeCompare(right);
    }),
  );
  return Object.keys(ordered).length ? ordered : null;
}

function parseOfficialAnswerValue(
  value: unknown,
  typeHint: MetadataType,
  optionCount: number,
  counterPrimary?: string,
): OfficialAnswer {
  const record = asRecord(value);
  if (record && typeof record.kind === "string") {
    if (record.kind === "bonus") return { kind: "bonus" };
    if (record.kind === "dropped") return { kind: "dropped" };
    if (record.kind === "missing") return { kind: "missing" };
    if (record.kind === "nat") {
      const text = numericalText(record.raw);
      if (typeHint === "objective" || typeHint === "single_correct" || typeHint === "multiple_correct") {
        const options = parseOptionTokens(text ?? "", optionCount, counterPrimary);
        return options.length ? { kind: "choice", values: options } : { kind: "missing" };
      }
      return text == null ? { kind: "missing" } : { kind: "nat", raw: text };
    }
    if (record.kind === "choice") {
      if (typeHint === "numerical") {
        const text = numericalText(record.values);
        return text == null ? { kind: "missing" } : { kind: "nat", raw: text };
      }
      const options = parseOptionTokens(record.values, optionCount, counterPrimary);
      return options.length ? { kind: "choice", values: options } : { kind: "missing" };
    }
    if (record.kind === "msm") {
      const rows = matrixRows(record.rows);
      return rows ? { kind: "msm", rows } : { kind: "missing" };
    }
  }

  if (typeof value === "string" && ["BONUS", "DROPPED"].includes(value.trim().toUpperCase())) {
    return value.trim().toUpperCase() === "BONUS" ? { kind: "bonus" } : { kind: "dropped" };
  }
  if (typeHint === "numerical") {
    const text = numericalText(value);
    return text == null ? { kind: "missing" } : { kind: "nat", raw: text };
  }
  if (typeHint === "matrix_match") {
    const rows = matrixRows(value);
    return rows ? { kind: "msm", rows } : { kind: "missing" };
  }

  const options = parseOptionTokens(value, optionCount, counterPrimary);
  return options.length ? { kind: "choice", values: options } : { kind: "missing" };
}

/** Parse imported answer-key shapes into the single internal answer representation. */
export function parseOfficialAnswer(
  raw: unknown,
  questionType: unknown,
  optionCount = 4,
  counterPrimary?: string,
): OfficialAnswer {
  const payload = extractPayload(raw);
  const questionHint = questionTypeHint(questionType);
  const keyHint = questionTypeHint(payload.declaredType);
  const typeHint = questionHint === "numerical" || questionHint === "matrix_match"
    ? questionHint
    : questionHint && questionHint !== "objective"
      ? questionHint
      : keyHint ?? questionHint;
  const effectiveCounter = counterPrimary ?? payload.counterPrimary;
  const effectiveCount = Number.isInteger(optionCount) && optionCount > 0 ? optionCount : 4;
  return parseOfficialAnswerValue(payload.value, typeHint, effectiveCount, effectiveCounter);
}

/** A concrete answer set is authoritative over generic/single/multiple metadata. */
export function resolveQuestionType(questionType: unknown, answer: OfficialAnswer): QuestionType {
  const hint = questionTypeHint(questionType);
  if (hint === "numerical" || hint === "matrix_match") return hint;
  if (answer.kind === "nat") return "numerical";
  if (answer.kind === "msm") return "matrix_match";
  if (answer.kind === "choice") {
    const count = new Set(answer.values.filter((value) => Number.isInteger(value) && value > 0)).size;
    if (count === 1) return "single_correct";
    if (count >= 2) return "multiple_correct";
  }
  if (hint === "single_correct" || hint === "multiple_correct") return hint;
  return "objective";
}

/** Question type is authoritative for NAT/matrix; answer-key metadata can clarify an ambiguous MCQ. */
export function combineQuestionType(questionType: unknown, answerKeyType?: unknown): MetadataType {
  const questionHint = questionTypeHint(questionType);
  const keyHint = questionTypeHint(answerKeyType);
  if (questionHint === "numerical" || questionHint === "matrix_match") return questionHint;
  if (questionHint && questionHint !== "objective") return questionHint;
  if (keyHint === "numerical" || keyHint === "matrix_match") return keyHint;
  if (questionHint) return questionHint;
  return keyHint;
}

/** Convert historical MCQ/MSQ answer records and currently imported records in one place. */
export function normalizeQuestion(value: unknown): Question {
  const raw = asRecord(value) ?? {};
  const legacyAnswer = Object.hasOwn(raw, "correctAnswer") ? raw.correctAnswer : raw.answer;
  const questionType = raw.type ?? raw.questionType;
  const optionCountValue = finiteNumber(raw.optionCount);
  const parseOptionCount = optionCountValue != null && optionCountValue >= 1 ? Math.floor(optionCountValue) : 4;
  const counterPrimary = typeof raw.counterPrimary === "string" ? raw.counterPrimary : undefined;
  let answer = parseOfficialAnswer(legacyAnswer, questionType, parseOptionCount, counterPrimary);
  const legacyValue = asRecord(legacyAnswer);
  if (!Object.hasOwn(raw, "correctAnswer") && questionTypeHint(questionType) === "objective" && legacyValue?.kind === "nat") {
    // Before canonical types existed, the old MCQ parser stored unparsed labels/index sets as `nat.raw`.
    // Re-interpret those historical answer fields using the legacy MCQ metadata, not as NAT values.
    answer = parseOfficialAnswer(legacyValue.raw, questionType, parseOptionCount, counterPrimary);
  }
  const type = resolveQuestionType(questionType, answer);
  const optionCount = type === "numerical" ? 0 : parseOptionCount;
  const {
    answer: _legacyAnswer,
    questionType: _legacyQuestionType,
    ...rest
  } = raw;
  return {
    ...rest,
    id: typeof raw.id === "string" ? raw.id : "",
    subject: typeof raw.subject === "string" ? raw.subject : "General",
    canonicalSubject: typeof raw.canonicalSubject === "string" ? raw.canonicalSubject : "General",
    section: typeof raw.section === "string" ? raw.section : "",
    number: finiteNumber(raw.number) ?? 0,
    type,
    marks: asRecord(raw.marks) as Question["marks"] ?? { cm: 0, im: 0 },
    optionCount,
    msmRows: finiteNumber(raw.msmRows) ?? 1,
    msmCols: finiteNumber(raw.msmCols) ?? 1,
    ...(counterPrimary ? { counterPrimary } : {}),
    correctAnswer: answer,
    hasAnswerKey: answer.kind !== "missing",
    imageIds: Array.isArray(raw.imageIds) ? raw.imageIds.filter((item): item is string => typeof item === "string") : [],
  } as Question;
}

export function normalizeStoredTest(value: unknown): StoredTest {
  const raw = asRecord(value) ?? {};
  const {
    questions: rawQuestions,
    ...rest
  } = raw;
  const questions = Array.isArray(rawQuestions) ? rawQuestions.map(normalizeQuestion) : [];
  return {
    ...rest,
    id: typeof raw.id === "string" ? raw.id : "",
    name: typeof raw.name === "string" ? raw.name : "Untitled paper",
    examType: raw.examType === "jee-main" || raw.examType === "jee-advanced" ? raw.examType : "custom",
    kind: raw.kind === "full" || raw.kind === "part" ? raw.kind : "practice",
    durationSeconds: finiteNumber(raw.durationSeconds) ?? 3600,
    createdAt: finiteNumber(raw.createdAt) ?? Date.now(),
    sourceFile: typeof raw.sourceFile === "string" ? raw.sourceFile : "",
    subjects: Array.isArray(raw.subjects) ? raw.subjects.filter((item): item is string => typeof item === "string") : [],
    sections: Array.isArray(raw.sections) ? raw.sections as StoredTest["sections"] : [],
    questions,
    validation: Array.isArray(raw.validation) ? raw.validation as StoredTest["validation"] : [],
  } as StoredTest;
}

export function normalizeUserAnswer(value: unknown): UserAnswer | null {
  const raw = asRecord(value);
  if (!raw || typeof raw.kind !== "string") return null;
  if (raw.kind === "choice") {
    const options = Array.isArray(raw.options)
      ? raw.options.map(finiteNumber).filter((n): n is number => n != null && Number.isInteger(n) && n > 0)
      : [];
    return options.length ? { kind: "choice", options: [...new Set(options)].sort((a, b) => a - b) } : null;
  }
  if (raw.kind === "mcq") {
    const option = finiteNumber(raw.option);
    return option != null && Number.isInteger(option) && option > 0 ? { kind: "choice", options: [option] } : null;
  }
  if (raw.kind === "msq") {
    const options = Array.isArray(raw.options)
      ? raw.options.map(finiteNumber).filter((n): n is number => n != null && Number.isInteger(n) && n > 0)
      : [];
    return options.length ? { kind: "choice", options: [...new Set(options)].sort((a, b) => a - b) } : null;
  }
  if (raw.kind === "nat") {
    return typeof raw.value === "string" || typeof raw.value === "number"
      ? { kind: "nat", value: String(raw.value) }
      : null;
  }
  if (raw.kind === "msm") {
    const rows = matrixRows(raw.rows);
    return rows ? { kind: "msm", rows } : null;
  }
  return null;
}

export function normalizeAttempt(value: unknown): Attempt {
  const raw = asRecord(value) ?? {};
  const rawResponses = asRecord(raw.responses) ?? {};
  const submittedLegacySave = raw.status === "submitted" && Boolean(raw.realExamSave);
  const responses: Record<string, AttemptResponse> = {};
  for (const [questionId, responseValue] of Object.entries(rawResponses)) {
    const response = asRecord(responseValue) ?? {};
    let answer = normalizeUserAnswer(response.answer);
    let pending = normalizeUserAnswer(response.pending);
    const hasPendingFlag = typeof response.pendingDirty === "boolean";
    let pendingDirty = hasPendingFlag
      ? Boolean(response.pendingDirty)
      : Boolean(pending && JSON.stringify(pending) !== JSON.stringify(answer));
    let status: AttemptResponse["status"] = ["notVisited", "notAnswered", "answered", "marked", "markedAnswered"].includes(String(response.status))
      ? response.status as AttemptResponse["status"]
      : "notVisited";
    // Older builds did not commit a real-exam draft when the student submitted.
    // Recover a distinct, non-empty pending selection for those historical attempts.
    if (submittedLegacySave && !hasPendingFlag && pendingDirty && pending) {
      answer = pending;
      pending = null;
      pendingDirty = false;
      status = status === "marked" || status === "markedAnswered" ? "markedAnswered" : "answered";
    }
    responses[questionId] = {
      questionId: typeof response.questionId === "string" ? response.questionId : questionId,
      answer,
      pending,
      pendingDirty,
      status,
      timeSpent: finiteNumber(response.timeSpent) ?? 0,
    };
  }
  const numbering = raw.numbering === "original" || raw.numbering === "section-wise" ? raw.numbering : "cumulative";
  return {
    ...raw,
    id: typeof raw.id === "string" ? raw.id : "",
    testId: typeof raw.testId === "string" ? raw.testId : "",
    testName: typeof raw.testName === "string" ? raw.testName : "Untitled paper",
    examType: raw.examType === "jee-main" || raw.examType === "jee-advanced" ? raw.examType : "custom",
    kind: raw.kind === "full" || raw.kind === "part" ? raw.kind : "practice",
    status: raw.status === "submitted" ? "submitted" : "ongoing",
    startedAt: finiteNumber(raw.startedAt) ?? Date.now(),
    updatedAt: finiteNumber(raw.updatedAt) ?? Date.now(),
    durationSeconds: finiteNumber(raw.durationSeconds) ?? 3600,
    remainingSeconds: finiteNumber(raw.remainingSeconds) ?? 0,
    currentQuestionId: typeof raw.currentQuestionId === "string" ? raw.currentQuestionId : "",
    questionOpenedAt: finiteNumber(raw.questionOpenedAt) ?? Date.now(),
    numbering,
    realExamSave: Boolean(raw.realExamSave),
    displayNumbers: asRecord(raw.displayNumbers) as Record<string, number> ?? {},
    responses,
  } as Attempt;
}
