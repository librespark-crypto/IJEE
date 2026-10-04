import { readFileSync } from "node:fs";
import { buildEvaluation, evaluateQuestion } from "../src/lib/evaluate";
import { parseUpload } from "../src/lib/pdf2cbt";
import { createAttempt } from "../src/lib/attempt";
import type { AttemptResponse, OfficialAnswer, Question, QuestionType, StoredTest } from "../src/lib/types";

function q(partial: Partial<Question> & Pick<Question, "id" | "type" | "marks" | "answer">): Question {
  return {
    subject: "Physics",
    canonicalSubject: "Physics",
    section: "Physics Section 1",
    number: 1,
    optionCount: 4,
    msmRows: 2,
    msmCols: 4,
    hasAnswerKey: partial.answer.kind !== "missing",
    imageIds: [],
    ...partial,
  };
}

function response(questionId: string, status: AttemptResponse["status"], answer: AttemptResponse["answer"]): AttemptResponse {
  return { questionId, status, answer, pending: answer, timeSpent: 30 };
}

function expect(name: string, actual: unknown, wanted: unknown) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(wanted);
  if (left !== right) {
    console.error("FAIL", name, "got", left, "wanted", right);
    process.exitCode = 1;
  } else {
    console.log("ok", name);
  }
}

const mcq = q({ id: "mcq", type: "mcq", marks: { cm: 4, im: -1 }, answer: { kind: "choice", values: [2] } });
expect("mcq correct", evaluateQuestion(mcq, response("mcq", "answered", { kind: "mcq", option: 2 })).marks, 4);
expect("mcq wrong", evaluateQuestion(mcq, response("mcq", "answered", { kind: "mcq", option: 1 })).marks, -1);
expect("mcq blank", evaluateQuestion(mcq, response("mcq", "notAnswered", null)).marks, 0);
expect("mcq or-key", evaluateQuestion(q({ id: "or", type: "mcq", marks: { cm: 4, im: -1 }, answer: { kind: "choice", values: [2, 3] } }), response("or", "answered", { kind: "mcq", option: 3 })).status, "correct");

const msq = q({ id: "msq", type: "msq", marks: { cm: 4, pm: 1, im: -2 }, answer: { kind: "choice", values: [1, 2, 4] } });
expect("msq full", evaluateQuestion(msq, response("msq", "markedAnswered", { kind: "msq", options: [1, 2, 4] })).marks, 4);
expect("msq partial", evaluateQuestion(msq, response("msq", "answered", { kind: "msq", options: [1, 2] })).marks, 2);
expect("msq wrong option", evaluateQuestion(msq, response("msq", "answered", { kind: "msq", options: [1, 3] })).marks, -2);
expect("msq ignores single-correct payload", evaluateQuestion(msq, response("msq", "answered", { kind: "mcq", option: 1 })).status, "notAnswered");

const nat = q({ id: "nat", type: "nat", marks: { cm: 3, im: 0 }, answer: { kind: "nat", raw: "1.5TO2.5,4" } });
expect("nat range", evaluateQuestion(nat, response("nat", "answered", { kind: "nat", value: "2.0" })).status, "correct");
expect("nat alt", evaluateQuestion(nat, response("nat", "answered", { kind: "nat", value: "4" })).status, "correct");
expect("nat miss", evaluateQuestion(nat, response("nat", "answered", { kind: "nat", value: "3" })).marks, 0);

const dropped = q({ id: "drop", type: "msq", marks: { cm: 4, im: -2 }, answer: { kind: "dropped" } });
expect("dropped", evaluateQuestion(dropped, response("drop", "notVisited", null)).status, "dropped");
const bonus = q({ id: "bonus", type: "mcq", marks: { cm: 3, im: -1 }, answer: { kind: "bonus" } });
expect("bonus blank", evaluateQuestion(bonus, response("bonus", "notAnswered", null)).marks, 0);
expect("bonus attempted", evaluateQuestion(bonus, response("bonus", "answered", { kind: "mcq", option: 1 })).marks, 3);

const msm = q({
  id: "msm",
  type: "msm",
  marks: { cm: 3, im: -1 },
  answer: { kind: "msm", rows: { "1": [1, 2], "2": [3] } },
});
const msmResult = evaluateQuestion(msm, response("msm", "answered", { kind: "msm", rows: { "1": [1, 2], "2": [4] } }));
expect("msm partial marks", msmResult.marks, 2);
expect("msm partial status", msmResult.status, "partial");

const questions: Question[] = [1, 2, 3, 4].map((number) => q({
  id: `o${number}`,
  number,
  type: "mcq" as QuestionType,
  marks: { cm: 4, im: -1 },
  answer: { kind: "choice", values: [1] } as OfficialAnswer,
  section: "S",
}));
const test: StoredTest = {
  id: "t",
  name: "Optional",
  examType: "jee-main",
  kind: "practice",
  durationSeconds: 600,
  createdAt: 1,
  sourceFile: "x.zip",
  subjects: ["Physics"],
  sections: [{ subject: "Physics", name: "S", optionalQuestions: 2, questionIds: questions.map((item) => item.id) }],
  questions,
  validation: [],
};
const attempt = createAttempt(test, "original", false, 600);
attempt.responses.o1 = response("o1", "answered", { kind: "mcq", option: 1 });
attempt.responses.o3 = response("o3", "answered", { kind: "mcq", option: 2 });
attempt.responses.o4 = response("o4", "answered", { kind: "mcq", option: 1 });
const evaluation = buildEvaluation(test, attempt);
const byId = Object.fromEntries(evaluation.questions.map((item) => [item.questionId, item.status]));
expect("optional keeps first attempted", byId.o1, "correct");
expect("optional keeps second attempted", byId.o3, "incorrect");
expect("optional drops later attempt", byId.o4, "notConsidered");
expect("optional drops unattempted extra", byId.o2, "notConsidered");
expect("optional max excludes extras", evaluation.maxMarks, 8);

console.log(process.exitCode ? "engine checks failed" : "engine checks passed");

async function checkZip() {
  const zipPath = "/tmp/pdf2cbt/demo_pre.zip";
  const file = new File([readFileSync(zipPath)], "demo_pre.zip", { type: "application/zip" });
  const parsed = await parseUpload(file);
  if (parsed.kind !== "test") {
    console.error("FAIL parser did not return a test");
    process.exitCode = 1;
    return;
  }
  expect("demo questions", parsed.test.questions.length, 54);
  expect("demo keyed", parsed.test.questions.filter((item) => item.hasAnswerKey).length, 54);
  expect("demo images", parsed.images.length, parsed.test.questions.reduce((sum, item) => sum + item.imageIds.length, 0));
  expect("demo no crop", parsed.cropJobs.length, 0);
  expect("demo blocking", parsed.blocking.length, 0);
  const q1 = parsed.test.questions.find((item) => item.number === 1 && item.subject === "Physics");
  expect("demo q1 type", q1?.type, "msq");
  expect("demo q1 key", q1?.answer, { kind: "choice", values: [1, 2, 4] });
  const droppedQ = parsed.test.questions.find((item) => item.number === 39);
  expect("demo dropped", droppedQ?.answer.kind, "dropped");
  console.log(process.exitCode ? "parser checks failed" : "parser checks passed", parsed.test.examType, parsed.test.kind);
}

void checkZip();
