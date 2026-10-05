import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { createAttempt, navigateAttempt, setAttemptAnswer, submitAttempt, toggleChoiceAnswer, visibleAnswer } from "../src/lib/attempt";
import { buildEvaluation, evaluateQuestion } from "../src/lib/evaluate";
import { parseOfficialAnswer, resolveQuestionType, normalizeAttempt, normalizeStoredTest } from "../src/lib/question-normalizer";
import { answerIndexKey, applyAnswerKey, parseUpload } from "../src/lib/pdf2cbt";
import type { AttemptResponse, OfficialAnswer, Question, QuestionType, StoredTest, UserAnswer } from "../src/lib/types";

const IMAGE_NAME = "Section A__--__1__--__1.png";

async function importQuestion(
  questionType: string,
  key?: unknown,
  questionId = "1",
  resultKey?: unknown,
  marks: { cm: number; im: number; pm?: number } = { cm: 4, im: -1 },
) {
  const zip = new JSZip();
  const root = {
    pdfCropperData: {
      Physics: {
        "Section A": {
          [questionId]: {
            que: Number(questionId),
            type: questionType,
            answerOptions: "4",
            marks,
            ...(resultKey === undefined ? {} : { result: { correctAnswer: resultKey } }),
          },
        },
      },
    },
    testAnswerKey: key === undefined ? undefined : { Physics: { "Section A": { [questionId]: key } } },
    testConfig: { testName: "Question type import fixture", testDurationInSeconds: 600 },
  };
  zip.file("data.json", JSON.stringify(root));
  zip.file(IMAGE_NAME.replace("__--__1__--__", `__--__${questionId}__--__`), new Uint8Array([137, 80, 78, 71]));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const file = new File([arrayBuffer], "question-fixture.zip", { type: "application/zip" });
  const parsed = await parseUpload(file);
  assert.equal(parsed.kind, "test", "ZIP should produce a test import");
  if (parsed.kind !== "test") throw new Error("Expected a test import");
  assert.equal(parsed.blocking.length, 0, parsed.blocking.join("; "));
  assert.equal(parsed.test.questions.length, 1);
  return parsed.test.questions[0]!;
}

function question(
  id: string,
  type: QuestionType,
  correctAnswer: OfficialAnswer,
  overrides: Partial<Question> = {},
): Question {
  return {
    id,
    subject: "Physics",
    canonicalSubject: "Physics",
    section: "Section A",
    number: 1,
    type,
    marks: { cm: 4, im: -1 },
    optionCount: 4,
    msmRows: 1,
    msmCols: 4,
    correctAnswer,
    hasAnswerKey: correctAnswer.kind !== "missing",
    imageIds: [],
    ...overrides,
  };
}

function testPaper(questions: Question[]): StoredTest {
  return {
    id: "test-id",
    name: "Pipeline test",
    examType: "jee-main",
    kind: "practice",
    durationSeconds: 600,
    createdAt: 1,
    sourceFile: "fixture.zip",
    subjects: ["Physics"],
    sections: [{ subject: "Physics", name: "Section A", optionalQuestions: 0, questionIds: questions.map((q) => q.id) }],
    questions,
    validation: [],
  };
}

function response(questionId: string, answer: UserAnswer | null, status: AttemptResponse["status"] = answer ? "answered" : "notAnswered"): AttemptResponse {
  return { questionId, answer, pending: null, pendingDirty: false, status, timeSpent: 30 };
}

test("MCQ with one keyed option normalizes to Single Correct", async () => {
  const parsed = await importQuestion("MCQ", "A");
  assert.equal(parsed.type, "single_correct");
  assert.deepEqual(parsed.correctAnswer, { kind: "choice", values: [1] });
});

test("MCQ with two keyed options normalizes to Multiple Correct", async () => {
  const parsed = await importQuestion("MCQ", "A,C");
  assert.equal(parsed.type, "multiple_correct");
  assert.deepEqual(parsed.correctAnswer, { kind: "choice", values: [1, 3] });
});

test("MCQ with three keyed options normalizes to Multiple Correct", async () => {
  const parsed = await importQuestion("MCQ", "A,C,D");
  assert.equal(parsed.type, "multiple_correct");
  assert.deepEqual(parsed.correctAnswer, { kind: "choice", values: [1, 3, 4] });
});

test("question result metadata supplies a usable key when the global key is absent", async () => {
  const parsed = await importQuestion("MCQ", undefined, "1", { type: "MCQ", correctAnswer: "C" });
  assert.equal(parsed.type, "single_correct");
  assert.deepEqual(parsed.correctAnswer, { kind: "choice", values: [3] });
});

test("NAT stays numerical even when its answer looks like option indexes", async () => {
  const parsed = await importQuestion("NAT", "1,3");
  assert.equal(parsed.type, "numerical");
  assert.deepEqual(parsed.correctAnswer, { kind: "nat", raw: "1,3" });
});

test("answer-key option formats parse as labels or one-/zero-based indexes", () => {
  assert.deepEqual(parseOfficialAnswer("B", "MCQ", 4), { kind: "choice", values: [2] });
  assert.deepEqual(parseOfficialAnswer("[A,C]", "MCQ", 4), { kind: "choice", values: [1, 3] });
  assert.deepEqual(parseOfficialAnswer('["A","C"]', "MCQ", 4), { kind: "choice", values: [1, 3] });
  assert.deepEqual(parseOfficialAnswer("1,3", "MCQ", 4), { kind: "choice", values: [1, 3] });
  assert.deepEqual(parseOfficialAnswer("0,2", "MCQ", 4), { kind: "choice", values: [1, 3] });
  assert.deepEqual(parseOfficialAnswer("1,3", "NAT", 4), { kind: "nat", raw: "1,3" });
  assert.deepEqual(parseOfficialAnswer({ type: "MCQ", kind: "nat", raw: "1,3" }, "MCQ", 4), { kind: "nat", raw: "1,3" });
});

test("answer-key-only JSON stays raw until matched and then normalizes per target question", async () => {
  const keyJson = {
    testAnswerKey: {
      Physics: {
        "Section A": {
          "1": { type: "MCQ", correctAnswer: "[A,C]" },
          "2": "1,3",
        },
      },
    },
  };
  const file = new File([JSON.stringify(keyJson)], "answer-key.json", { type: "application/json" });
  const parsedKey = await parseUpload(file);
  assert.equal(parsedKey.kind, "answer-key");
  if (parsedKey.kind !== "answer-key") throw new Error("Expected an answer-key import");
  assert.equal(parsedKey.keyed, 2);
  assert.deepEqual(parsedKey.answers[answerIndexKey("Physics", "Section A", 1)]?.raw, { type: "MCQ", correctAnswer: "[A,C]" });

  const objective = question("objective", "objective", { kind: "missing" }, { number: 1, hasAnswerKey: false });
  const numerical = question("numeric", "numerical", { kind: "missing" }, { number: 2, hasAnswerKey: false });
  const attached = applyAnswerKey(testPaper([objective, numerical]), parsedKey.answers);
  assert.equal(attached.questions[0]?.type, "multiple_correct");
  assert.deepEqual(attached.questions[0]?.correctAnswer, { kind: "choice", values: [1, 3] });
  assert.equal(attached.questions[1]?.type, "numerical");
  assert.deepEqual(attached.questions[1]?.correctAnswer, { kind: "nat", raw: "1,3" });
});

test("ambiguous MCQ metadata alone is not normalized to either correct-answer type", async () => {
  const parsed = await importQuestion("MCQ");
  assert.equal(parsed.type, "objective");
  assert.equal(resolveQuestionType("MCQ", { kind: "missing" }), "objective");
});

test("stored numerical questions keep a zero option count", () => {
  const numerical = question("numeric-no-options", "numerical", { kind: "nat", raw: "1" }, { optionCount: 0 });
  assert.equal(normalizeStoredTest(testPaper([numerical])).questions[0]?.optionCount, 0);
});

test("numerical tolerance/range evaluation remains intact", () => {
  const q = question("numeric-range", "numerical", { kind: "nat", raw: "1.5TO2.5,4" }, { marks: { cm: 3, im: 0 } });
  assert.equal(evaluateQuestion(q, response(q.id, { kind: "nat", value: "2.0" })).status, "correct");
  assert.equal(evaluateQuestion(q, response(q.id, { kind: "nat", value: "4" })).status, "correct");
  assert.equal(evaluateQuestion(q, response(q.id, { kind: "nat", value: "3" })).status, "incorrect");
});

test("single-correct selection replaces the previous radio selection and scores exactly", () => {
  const q = question("single", "single_correct", { kind: "choice", values: [2] });
  const first = toggleChoiceAnswer("single_correct", null, 1);
  const second = toggleChoiceAnswer("single_correct", first, 2);
  assert.deepEqual(second, { kind: "choice", options: [2] });
  assert.equal(evaluateQuestion(q, response(q.id, second)).status, "correct");
  assert.equal(evaluateQuestion(q, response(q.id, { kind: "choice", options: [1] })).status, "incorrect");
  assert.equal(evaluateQuestion(q, response(q.id, { kind: "choice", options: [1, 2] })).status, "incorrect");
});

test("multiple-correct requires an exact set; partial credit requires an imported partial rule", () => {
  const key: OfficialAnswer = { kind: "choice", values: [1, 3, 4] };
  const noPartial = question("multi-no-partial", "multiple_correct", key, { marks: { cm: 4, im: -1 } });
  const partialAnswer: UserAnswer = { kind: "choice", options: [1, 3] };
  const partialWithoutRule = evaluateQuestion(noPartial, response(noPartial.id, partialAnswer));
  assert.equal(partialWithoutRule.status, "incorrect");
  assert.equal(partialWithoutRule.marks, -1);

  const withPartial = question("multi-partial", "multiple_correct", key, { marks: { cm: 4, im: -1, pm: 1 } });
  const partialWithRule = evaluateQuestion(withPartial, response(withPartial.id, partialAnswer));
  assert.equal(partialWithRule.status, "partial");
  assert.equal(partialWithRule.marks, 2);

  const exact = evaluateQuestion(withPartial, response(withPartial.id, { kind: "choice", options: [4, 1, 3] }));
  assert.equal(exact.status, "correct");
  assert.equal(exact.marks, 4);
});

test("partial marks are used only when the imported key explicitly contains pm", async () => {
  const imported = await importQuestion("MSQ", "A,C", "1", undefined, { cm: 4, im: -1, pm: 2 });
  assert.equal(imported.type, "multiple_correct");
  assert.equal(imported.marks.pm, 2);
  const result = evaluateQuestion(imported, response(imported.id, { kind: "choice", options: [1] }));
  assert.equal(result.status, "partial");
  assert.equal(result.marks, 2);
});

test("an extra selected MSQ option is incorrect", () => {
  const q = question("multi-extra", "multiple_correct", { kind: "choice", values: [1, 3] });
  const result = evaluateQuestion(q, response(q.id, { kind: "choice", options: [1, 3, 4] }));
  assert.equal(result.status, "incorrect");
  assert.equal(result.marks, -1);
});

test("matrix match, bonus, and dropped-question scoring stay compatible", () => {
  const matrix = question("matrix", "matrix_match", { kind: "msm", rows: { "1": [1, 2], "2": [3] } }, {
    msmRows: 2,
    marks: { cm: 3, im: -1 },
  });
  const matrixResult = evaluateQuestion(matrix, response(matrix.id, { kind: "msm", rows: { "1": [1, 2], "2": [4] } }));
  assert.equal(matrixResult.status, "partial");
  assert.equal(matrixResult.marks, 2);

  const bonus = question("bonus", "single_correct", { kind: "bonus" }, { marks: { cm: 3, im: -1 } });
  assert.equal(evaluateQuestion(bonus, response(bonus.id, null, "notAnswered")).status, "notAnswered");
  assert.equal(evaluateQuestion(bonus, response(bonus.id, { kind: "choice", options: [1] })).status, "bonus");
  const dropped = question("dropped", "multiple_correct", { kind: "dropped" });
  assert.equal(evaluateQuestion(dropped, response(dropped.id, null, "notAnswered")).status, "dropped");
});

test("multiple selections persist through question and palette-style navigation and resume", () => {
  const multi = question("multi", "multiple_correct", { kind: "choice", values: [1, 3] });
  const single = question("single", "single_correct", { kind: "choice", values: [2] }, { number: 2 });
  const paper = testPaper([multi, single]);
  let attempt = createAttempt(paper, "original", true, 600);
  const selected = toggleChoiceAnswer("multiple_correct", null, 1);
  const selectedBoth = toggleChoiceAnswer("multiple_correct", selected, 3);
  attempt = setAttemptAnswer(attempt, multi.id, multi.type, selectedBoth, 1000);
  attempt = navigateAttempt(attempt, single.id, 2000);
  attempt = navigateAttempt(attempt, multi.id, 3000);
  assert.deepEqual(visibleAnswer(attempt, multi.id), { kind: "choice", options: [1, 3] });

  const resumed = normalizeAttempt(JSON.parse(JSON.stringify(attempt)));
  assert.deepEqual(visibleAnswer(resumed, multi.id), { kind: "choice", options: [1, 3] });
  assert.equal(resumed.currentQuestionId, multi.id);
});

test("submit commits draft selections and analysis preserves type, keys, labels, and statistics", () => {
  const single = question("single", "single_correct", { kind: "choice", values: [2] }, { number: 1 });
  const multi = question("multi", "multiple_correct", { kind: "choice", values: [1, 3] }, { number: 2, marks: { cm: 4, im: -1 } });
  const numerical = question("numeric", "numerical", { kind: "nat", raw: "12.5" }, { number: 3, marks: { cm: 3, im: 0 } });
  const paper = testPaper([single, multi, numerical]);
  let attempt = createAttempt(paper, "cumulative", true, 600);
  attempt = setAttemptAnswer(attempt, single.id, single.type, { kind: "choice", options: [2] }, 1000);
  attempt = setAttemptAnswer(attempt, multi.id, multi.type, { kind: "choice", options: [3, 1] }, 1100);
  attempt = setAttemptAnswer(attempt, numerical.id, numerical.type, { kind: "nat", value: "12.5" }, 1200);

  const submitted = submitAttempt(paper, attempt, false, 2000);
  assert.equal(submitted.status, "submitted");
  assert.deepEqual(submitted.responses[multi.id]?.answer, { kind: "choice", options: [1, 3] });
  assert.equal(submitted.responses[multi.id]?.pendingDirty, false);
  const evaluation = buildEvaluation(paper, submitted);
  assert.equal(evaluation.correct, 3);
  assert.equal(evaluation.incorrect, 0);
  assert.equal(evaluation.unattempted, 0);
  assert.deepEqual(evaluation.questions.map((row) => row.type), ["single_correct", "multiple_correct", "numerical"]);
  assert.deepEqual(evaluation.questions.map((row) => row.userLabel), ["B", "A, C", "12.5"]);
  assert.deepEqual(evaluation.questions.map((row) => row.correctLabel), ["B", "A, C", "12.5"]);
  assert.equal(evaluation.subjects[0]?.correct, 3);
  assert.deepEqual(evaluation.types.map((row) => row.name).sort(), ["Multiple Correct", "Numerical Answer", "Single Correct"].sort());

  const resumedFromHistory = normalizeAttempt(JSON.parse(JSON.stringify(submitted)));
  const historyEvaluation = buildEvaluation(normalizeStoredTest(JSON.parse(JSON.stringify(paper))), resumedFromHistory);
  assert.deepEqual(historyEvaluation.questions.map((row) => [row.type, row.status, row.userLabel, row.correctLabel]),
    evaluation.questions.map((row) => [row.type, row.status, row.userLabel, row.correctLabel]));
});

test("legacy saved MCQ/MSQ tests and answers migrate to canonical types and option sets", () => {
  const legacy = {
    id: "legacy-test",
    name: "Legacy",
    examType: "custom",
    kind: "practice",
    durationSeconds: 600,
    createdAt: 1,
    sourceFile: "old.zip",
    subjects: ["Physics"],
    sections: [],
    validation: [],
    questions: [
      {
        id: "legacy-msq",
        subject: "Physics",
        canonicalSubject: "Physics",
        section: "Section A",
        number: 1,
        type: "mcq",
        marks: { cm: 4, im: -1 },
        optionCount: 4,
        msmRows: 1,
        msmCols: 1,
        answer: { kind: "nat", raw: "1,3" },
        hasAnswerKey: true,
        imageIds: [],
      },
    ],
  };
  const paper = normalizeStoredTest(legacy);
  assert.equal(paper.questions[0]?.type, "multiple_correct");
  assert.deepEqual(paper.questions[0]?.correctAnswer, { kind: "choice", values: [1, 3] });

  const migrated = normalizeAttempt({
    id: "old-attempt",
    testId: "legacy-test",
    status: "ongoing",
    realExamSave: false,
    responses: { "legacy-msq": { questionId: "legacy-msq", answer: { kind: "msq", options: [1, 3] }, pending: null, status: "answered", timeSpent: 5 } },
  });
  assert.deepEqual(migrated.responses["legacy-msq"]?.answer, { kind: "choice", options: [1, 3] });

  const oldSubmitted = normalizeAttempt({
    id: "old-submitted",
    testId: "legacy-test",
    status: "submitted",
    realExamSave: true,
    responses: { "legacy-msq": { questionId: "legacy-msq", answer: null, pending: { kind: "msq", options: [1, 3] }, status: "notAnswered", timeSpent: 5 } },
  });
  assert.deepEqual(oldSubmitted.responses["legacy-msq"]?.answer, { kind: "choice", options: [1, 3] });
  assert.equal(oldSubmitted.responses["legacy-msq"]?.status, "answered");
});
