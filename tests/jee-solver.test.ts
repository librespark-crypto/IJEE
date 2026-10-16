import assert from "node:assert/strict";
import { test } from "node:test";
import {
  JEE_SOLVER_SYSTEM_PROMPT,
  assembleQuestionContext,
  buildChatGptUrl,
  buildClaudeUrl,
  buildExternalJeePrompt,
  buildGeminiUrl,
  buildGoogleSearchQuery,
  buildGoogleSearchUrl,
  buildJeeUserPrompt,
  buildQuestionTextOnly,
  describeContextForLogs,
  MAX_URL_PROMPT_CHARS,
  type QuestionContext,
  type QuestionImageAsset,
} from "../src/lib/jee-solver";
import type { ExamType, OfficialAnswer, Question, QuestionType, StoredTest, TestKind } from "../src/lib/types";

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "paper-1:physics:section-a:3",
    subject: "Physics",
    canonicalSubject: "Physics",
    section: "Section A",
    number: 3,
    type: "single_correct",
    marks: { cm: 4, im: -1 },
    optionCount: 4,
    msmRows: 1,
    msmCols: 4,
    correctAnswer: { kind: "choice", values: [2] },
    hasAnswerKey: true,
    imageIds: [],
    ...overrides,
  };
}

function testPaper(overrides: Partial<StoredTest> = {}): StoredTest {
  return {
    id: "paper-1",
    name: "Fixture Paper 2026",
    examType: "jee-main",
    kind: "full",
    durationSeconds: 10800,
    createdAt: 1,
    sourceFile: "fixture.zip",
    subjects: ["Physics", "Chemistry", "Mathematics"],
    sections: [{ subject: "Physics", name: "Section A", optionalQuestions: 0, questionIds: ["a", "b"] }],
    questions: [],
    validation: [],
    ...overrides,
  };
}

function imageAsset(id: string, order: number, overrides: Partial<QuestionImageAsset> = {}): QuestionImageAsset {
  return {
    imageId: id,
    order,
    role: order === 1 ? "question" : "figure",
    mimeType: "image/png",
    byteSize: 4096,
    missing: false,
    ...(order === 1 ? { base64: "aW1nZWRhdGE=", objectUrl: "blob:question" } : { objectUrl: `blob:${id}` }),
    fileName: `question-image-${order}.png`,
    ...overrides,
  };
}

test("JEE_SOLVER_SYSTEM_PROMPT carries the required rules and answer structure", () => {
  assert.match(JEE_SOLVER_SYSTEM_PROMPT, /JEE Main and JEE Advanced/);
  assert.match(JEE_SOLVER_SYSTEM_PROMPT, /Transcribe the question accurately when working from an image/);
  assert.match(JEE_SOLVER_SYSTEM_PROMPT, /evaluate every option independently/i);
  assert.match(JEE_SOLVER_SYSTEM_PROMPT, /Never invent facts, equations, answer-key entries/);
  assert.match(JEE_SOLVER_SYSTEM_PROMPT, /Do not claim an answer is verified merely because an AI model produced it/);
  for (const section of [
    "Question interpretation",
    "Concepts used",
    "Step-by-step solution",
    "Option-wise analysis",
    "Final answer",
    "Verification",
    "JEE shortcut or common trap",
  ]) {
    assert.ok(JEE_SOLVER_SYSTEM_PROMPT.includes(section), `missing section: ${section}`);
  }
});

test("text-only mathematics question builds a complete context and prompt", () => {
  const q = question({
    id: "paper-1:mathematics:section-a:1",
    subject: "Mathematics",
    canonicalSubject: "Mathematics",
    correctAnswer: { kind: "missing" },
    hasAnswerKey: false,
    imageIds: [],
    // Some ZIPs carry a text statement; the assembler passes it through.
  }) as Question & { text?: string };
  q.text = "If $x^2 + bx + c = 0$ has roots $\\alpha, \\beta$ with $\\alpha + \\beta = 5$ and $\\alpha\\beta = 6$, find $b + c$.";
  const context = assembleQuestionContext({ test: testPaper(), question: q, displayNumber: 7 });
  assert.equal(context.imageAssets.length, 0);
  assert.equal(context.options.join(","), "A,B,C,D");
  assert.equal(context.hasAnswerKey, false);
  assert.equal(context.answerKey, null);
  assert.match(context.questionText, /x\^2 \+ bx \+ c/);
  const prompt = buildJeeUserPrompt(context);
  assert.match(prompt, /Mathematics/);
  assert.match(prompt, /SINGLE CORRECT/);
  assert.match(prompt, /labeled A, B, C, D/);
  assert.match(prompt, /x\^2 \+ bx \+ c/);
  assert.doesNotMatch(prompt, /Official answer key/);
});

test("multiple-correct JEE Advanced question demands independent option analysis", () => {
  const q = question({
    type: "multiple_correct",
    correctAnswer: { kind: "choice", values: [1, 3] },
    optionCount: 4,
  });
  const context = assembleQuestionContext({
    test: testPaper({ examType: "jee-advanced" }),
    question: q,
  });
  const prompt = buildJeeUserPrompt(context);
  assert.match(prompt, /More than one option may be correct — evaluate every option independently/);
  // Answer key must not leak into the default prompt even though one exists.
  assert.doesNotMatch(prompt, /Official answer key/);
  assert.doesNotMatch(prompt, /A, C/);
});

test("answer key appears only when the verification workflow is selected", () => {
  const q = question({ type: "multiple_correct", correctAnswer: { kind: "choice", values: [1, 3] } });
  const paper = testPaper();
  const withoutKey = assembleQuestionContext({ test: paper, question: q });
  assert.equal(withoutKey.answerKey, null);
  assert.equal(withoutKey.importedSolution, undefined);

  const withKey = assembleQuestionContext({
    test: paper,
    question: q,
    includeAnswerKey: true,
    userAnswerLabel: "A, B",
  });
  assert.equal(withKey.answerKey, "A, C");
  const prompt = buildJeeUserPrompt(withKey);
  assert.match(prompt, /Official correct answer: A, C/);
  assert.match(prompt, /Student's answer in this attempt: A, B/);
  assert.match(prompt, /verification mode/);
});

test("physics question with a diagram keeps image order and roles", () => {
  const q = question({ imageIds: ["img-1", "img-2"] });
  const context = assembleQuestionContext({
    test: testPaper(),
    question: q,
    images: [imageAsset("img-1", 1), imageAsset("img-2", 2)],
  });
  assert.equal(context.imageAssets.length, 2);
  assert.deepEqual(
    context.imageAssets.map((asset) => asset.role),
    ["question", "figure"],
  );
  assert.deepEqual(
    context.imageAssets.map((asset) => asset.order),
    [1, 2],
  );
  assert.equal(context.diagramAssets.length, 1);
  const prompt = buildJeeUserPrompt(context);
  assert.match(prompt, /2 image\(s\) in original order/);
  assert.match(prompt, /image 1 is the main question/);
  assert.match(prompt, /All 2 image\(s\) are attached at their original, full resolution/);
  assert.match(prompt, /option content is inside the question images/);
});

test("a question with several images keeps every image in order", () => {
  const q = question({ imageIds: ["a", "b", "c", "d"] });
  const context = assembleQuestionContext({
    test: testPaper(),
    question: q,
    images: [imageAsset("a", 1), imageAsset("b", 2), imageAsset("c", 3), imageAsset("d", 4)],
  });
  assert.deepEqual(
    context.imageAssets.map((asset) => asset.imageId),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    context.diagramAssets.map((asset) => asset.imageId),
    ["b", "c", "d"],
  );
});

test("an image that fails to load is flagged and the prompt warns instead of guessing", () => {
  const q = question({ imageIds: ["img-1", "img-2"] });
  const context = assembleQuestionContext({
    test: testPaper(),
    question: q,
    images: [imageAsset("img-1", 1), imageAsset("img-2", 2, { missing: true, byteSize: 0 })],
  });
  assert.equal(context.imageAssets[1]!.missing, true);
  const prompt = buildJeeUserPrompt(context);
  assert.match(prompt, /1 of 2 image\(s\) \(image 2\) could not be loaded/);
  assert.match(prompt, /state which parts of the question are missing instead of guessing/i);
});

test("missing question text and missing images produce an explicit stop instruction", () => {
  const context = assembleQuestionContext({ test: testPaper(), question: question() });
  const prompt = buildJeeUserPrompt(context);
  assert.match(prompt, /No machine-readable question text was imported and no images are attached/);
  assert.match(prompt, /do not invent a question/i);
});

test("numerical-answer question requests the computed value with precision", () => {
  const q = question({
    type: "numerical",
    optionCount: 0,
    correctAnswer: { kind: "nat", raw: "12.50" },
    marks: { cm: 4, im: 0 },
  });
  const context = assembleQuestionContext({ test: testPaper(), question: q });
  assert.equal(context.options.length, 0);
  const prompt = buildJeeUserPrompt(context);
  assert.match(prompt, /numerical-answer/i);
  assert.match(prompt, /no options are given/i);
  assert.match(prompt, /not applicable — numerical answer/);
});

test("matrix-match question describes rows and columns", () => {
  const q = question({
    type: "matrix_match",
    optionCount: 4,
    msmRows: 4,
    msmCols: 4,
    correctAnswer: { kind: "msm", rows: { "1": [2], "2": [1, 3], "3": [4], "4": [2] } },
  });
  const context = assembleQuestionContext({ test: testPaper(), question: q });
  const prompt = buildJeeUserPrompt(context);
  assert.match(prompt, /matrix-match\*\* question with 4 rows and 4 columns/);
});

test("long LaTeX expressions are passed through and surfaced separately", () => {
  const q = question() as Question & { text?: string };
  q.text =
    "Evaluate $\\displaystyle\\int_{0}^{\\pi/2}\\frac{\\sin^{2026}x}{\\sin^{2026}x+\\cos^{2026}x}\\,dx$ and $\\lim_{n\\to\\infty}\\left(1+\\frac{1}{n^2}\\right)^{n^2}$.";
  const context = assembleQuestionContext({ test: testPaper(), question: q });
  assert.ok(context.latexContent.includes("\\int"));
  const prompt = buildJeeUserPrompt(context);
  // The statement itself carries the LaTeX — it must appear once, not duplicated.
  assert.match(prompt, /\\displaystyle\\int/);
  assert.equal(prompt.match(/\\displaystyle\\int/g)!.length, 1);
  assert.doesNotMatch(prompt, /LaTeX content captured with the question/);

  // A separate LaTeX-bearing field (e.g. a `statement` alongside `text`) surfaces on its own.
  const split = question() as Question & { text?: string; statement?: string };
  split.text = "Match the following integrals with their values.";
  split.statement = "$\\int_0^1 x e^x\\,dx$ and $\\int_0^{\\infty} e^{-x^2}\\,dx$";
  const splitContext = assembleQuestionContext({ test: testPaper(), question: split });
  const splitPrompt = buildJeeUserPrompt(splitContext);
  assert.match(splitPrompt, /LaTeX content captured with the question/);
  assert.match(splitPrompt, /\\int_0\^1 x e\^x/);
});

test("chemistry question with a reaction image instructs accurate reading of notation", () => {
  const q = question({
    subject: "Chemistry",
    canonicalSubject: "Chemistry",
    imageIds: ["img-1"],
    topic: "Aldehydes, Ketones and Carboxylic Acids",
    concept: "Aldol condensation",
  });
  const context = assembleQuestionContext({
    test: testPaper(),
    question: q,
    images: [imageAsset("img-1", 1)],
  });
  assert.equal(context.chapter, "Aldehydes, Ketones and Carboxylic Acids");
  assert.equal(context.concept, "Aldol condensation");
  const prompt = buildJeeUserPrompt(context);
  assert.match(prompt, /Chapter\/Topic: Aldehydes, Ketones and Carboxylic Acids/);
  assert.match(prompt, /Concept: Aldol condensation/);
  const external = buildExternalJeePrompt(context);
  assert.match(external, /attach the original question image\(s\)/);
});

test("external prompt embeds the system prompt and the honest image-transfer note", () => {
  const q = question({ imageIds: ["img-1"] });
  const context = assembleQuestionContext({
    test: testPaper(),
    question: q,
    images: [imageAsset("img-1", 1)],
  });
  const external = buildExternalJeePrompt(context);
  assert.ok(external.startsWith(JEE_SOLVER_SYSTEM_PROMPT.slice(0, 60)));
  assert.match(external, /# JEE question to solve/);
  assert.match(external, /NOTE FOR THE ASSISTANT: this question is provided as images/);
  // No answer key in the default external handoff.
  assert.doesNotMatch(external, /Official correct answer/);
});

test("Google Search query carries question text and exam keywords; image questions stay honest", () => {
  const textQ = question() as Question & { text?: string };
  textQ.text = "A body of mass 2 kg accelerates uniformly at 3 m/s^2. Find the net force.";
  const textContext = assembleQuestionContext({ test: testPaper(), question: textQ });
  const withText = buildGoogleSearchQuery(textContext);
  assert.equal(withText.textOnly, false);
  assert.match(withText.query, /net force/);
  assert.match(withText.query, /JEE Main/);
  assert.match(withText.query, /Physics/);

  const imageContext = assembleQuestionContext({
    test: testPaper(),
    question: question({ imageIds: ["img-1"], topic: "Rotational Motion" }),
    images: [imageAsset("img-1", 1)],
  });
  const imageOnly = buildGoogleSearchQuery(imageContext);
  assert.equal(imageOnly.textOnly, true);
  assert.match(imageOnly.query, /Rotational Motion/);
  assert.doesNotMatch(imageOnly.query, /undefined/);
});

test("provider URLs are safe, encoded, and honest about prefill support", () => {
  const google = buildGoogleSearchUrl("What is the escape velocity of Earth? JEE Main Physics");
  assert.ok(google.startsWith("https://www.google.com/search?q="));
  assert.ok(google.includes(encodeURIComponent("escape velocity")));

  const prompt = "Solve: find $\\lim_{x \\to 0} \\frac{\\sin x}{x}$ & prove it <严格>";
  const chatgpt = buildChatGptUrl(prompt);
  assert.ok(chatgpt.url.startsWith("https://chatgpt.com/?q="));
  assert.equal(chatgpt.truncated, false);
  const decoded = decodeURIComponent(chatgpt.url.split("?q=")[1]!);
  assert.equal(decoded, prompt);

  const claude = buildClaudeUrl(prompt);
  assert.ok(claude.url.startsWith("https://claude.ai/new?q="));
  assert.equal(decodeURIComponent(claude.url.split("?q=")[1]!), prompt);

  // Gemini has no documented prefill parameter — the URL must stay plain.
  assert.equal(buildGeminiUrl(), "https://gemini.google.com/app");

  for (const url of [google, chatgpt.url, claude.url, buildGeminiUrl()]) {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, "https:");
  }
});

test("over-long prompts are truncated with an explicit marker, never silently", () => {
  const longPrompt = "Solve this JEE question. ".repeat(1200); // ~27k chars
  const chatgpt = buildChatGptUrl(longPrompt);
  assert.equal(chatgpt.truncated, true);
  assert.ok(chatgpt.url.length < 40_000);
  const decoded = decodeURIComponent(chatgpt.url.split("?q=")[1]!);
  assert.ok(decoded.includes("prompt truncated to fit the URL"));
  assert.ok(decoded.length <= MAX_URL_PROMPT_CHARS + 200);

  const claude = buildClaudeUrl(longPrompt);
  assert.equal(claude.truncated, true);
});

test("question text only copy excludes solver rules and the answer key", () => {
  const q = question({ imageIds: ["img-1"] });
  const context = assembleQuestionContext({
    test: testPaper(),
    question: q,
    images: [imageAsset("img-1", 1)],
    includeAnswerKey: true,
  });
  const text = buildQuestionTextOnly(context);
  assert.match(text, /Options: A, B, C, D/);
  assert.match(text, /Physics · SINGLE CORRECT · JEE Main/);
  assert.doesNotMatch(text, /Official correct answer/);
  assert.doesNotMatch(text, /JEE_SOLVER_SYSTEM_PROMPT|expert JEE/);
});

test("context snapshot covers exactly one question — never another question's images", () => {
  const other = question({ id: "paper-1:chemistry:section-a:9", subject: "Chemistry", canonicalSubject: "Chemistry", imageIds: ["chem-img"] });
  const paper = testPaper({ questions: [other, question({ imageIds: ["img-1"] })] });
  const target = paper.questions[1]!;
  const context = assembleQuestionContext({
    test: paper,
    question: target,
    images: [imageAsset("img-1", 1)],
  });
  assert.equal(context.questionId, target.id);
  assert.ok(context.imageAssets.every((asset) => target.imageIds.includes(asset.imageId)));
  assert.ok(!context.imageAssets.some((asset) => asset.imageId === "chem-img"));
  assert.equal(context.jeeSystemPrompt, JEE_SOLVER_SYSTEM_PROMPT);
});

test("describeContextForLogs never exposes base64 payloads or the answer key", () => {
  const q = question({ imageIds: ["img-1", "img-2"] });
  const context = assembleQuestionContext({
    test: testPaper(),
    question: q,
    images: [imageAsset("img-1", 1), imageAsset("img-2", 2)],
    includeAnswerKey: true,
  });
  const logView = JSON.stringify(describeContextForLogs(context));
  assert.ok(!logView.includes("aW1nZWRhdGE="));
  assert.ok(!logView.includes("blob:"));
  assert.ok(!logView.includes(context.answerKey!));
  assert.equal(JSON.parse(logView).answerKeyIncluded, true);
});

test("marking scheme and metadata ride along with the context", () => {
  const context = assembleQuestionContext({
    test: testPaper({ kind: "part" as TestKind, examType: "jee-advanced" as ExamType }),
    question: question({ marks: { cm: 4, im: -2 }, section: "Physics Section B" }),
    sectionInstruction: "multiple-correct-options",
  });
  assert.match(context.markingScheme, /\+4/);
  assert.match(context.markingScheme, /−2/);
  const prompt = buildJeeUserPrompt(context);
  assert.match(prompt, /Section: Physics Section B/);
  assert.match(prompt, /Section instruction: multiple-correct-options/);
  assert.match(prompt, /JEE Advanced/);
});
