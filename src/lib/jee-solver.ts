// Centralized JEE solver prompt + question-context packaging.
//
// This module is intentionally pure and isomorphic: the same constants and
// builders run in the browser (external AI handoff) and on the server
// (built-in IJEE AI solving). It never touches IndexedDB or fetch —
// see question-context.ts for the client-side extraction service.

import {
  examLabel,
  formatOfficialAnswer,
  markingText,
  optionLabel,
  typeLabel,
} from "./format";
import type { ExamType, Question, QuestionType, StoredTest, TestKind } from "./types";

/**
 * The single, reusable JEE-level system prompt. Used by the built-in IJEE AI
 * and embedded into every external AI handoff where the destination supports
 * prefilled prompts.
 */
export const JEE_SOLVER_SYSTEM_PROMPT = `You are an expert JEE Mathematics, Physics, and Chemistry problem-solving assistant specializing in JEE Main and JEE Advanced.

Your objective is to produce mathematically rigorous, scientifically correct, exam-appropriate solutions.

Follow these rules:

1. Read the complete question, including all options, diagrams, graphs, units, and numerical data, before solving.
2. Identify the subject, underlying concept, relevant chapter, and applicable principles.
3. Transcribe the question accurately when working from an image. If any part is illegible, explicitly identify the missing information instead of guessing.
4. Solve independently from first principles wherever practical.
5. Show the essential derivation, equations, substitutions, calculations, and reasoning needed to verify the answer.
6. Use SI units where applicable and check dimensional consistency.
7. For Mathematics, preserve algebraic conditions, domains, roots, signs, and restrictions. Verify that the final result satisfies the original problem.
8. For Physics, identify the correct physical model, assumptions, equations, signs, units, and limiting conditions.
9. For Chemistry, use correct chemical notation, reaction conditions, mechanisms, stereochemistry, equilibrium conventions, and oxidation states where relevant.
10. For multiple-correct questions, evaluate every option independently. Do not assume that only one option is correct.
11. For numerical-answer questions, show the calculation and state the final value with the required precision or rounding.
12. Distinguish a rigorous derivation from a shortcut. Explain any shortcut used and state its limitations.
13. Check the final answer independently using substitution, an alternative method, dimensional analysis, or another suitable verification technique.
14. Never invent facts, equations, answer-key entries, or missing diagram information.
15. If multiple interpretations are possible, explain the ambiguity and state what additional information is required.
16. Do not claim an answer is verified merely because an AI model produced it.
17. Match the difficulty and depth to JEE Main or JEE Advanced as appropriate.

Required answer structure:

- **Question interpretation**
- **Concepts used**
- **Step-by-step solution**
- **Option-wise analysis**, when applicable
- **Final answer**
- **Verification**
- **JEE shortcut or common trap**, when useful

Keep explanations precise, educational, and easy to follow. Use properly rendered LaTeX for equations. Do not sacrifice correctness for speed.`;

/** One original-resolution image attached to a question, in original order. */
export type QuestionImageAsset = {
  imageId: string;
  /** 1-based position in the question's original image order. */
  order: number;
  /** Image 1 is the question itself; later images are figures/continuations. */
  role: "question" | "figure";
  mimeType: string;
  byteSize: number;
  /** True when the original blob could not be loaded from this browser. */
  missing: boolean;
  /** Original-resolution base64 payload (no data: prefix) for the built-in AI. */
  base64?: string;
  /** Object URL for preview / save / share. */
  objectUrl?: string;
  fileName: string;
};

/**
 * Everything an AI solver needs for exactly one question.
 * Derived at runtime from the existing IJEE schema — it is never persisted,
 * so it cannot drift from StoredTest/Question.
 */
export type QuestionContext = {
  questionId: string;
  displayNumber: number | null;
  subject: string;
  section: string;
  chapter?: string;
  concept?: string;
  examType: ExamType;
  testKind?: TestKind;
  testName: string;
  questionType: QuestionType;
  questionTypeLabel: string;
  /** Rows for a matrix-match question. */
  matrixRows: number;
  /** Columns for a matrix-match question. */
  matrixColumns: number;
  /** Plain text/HTML/Markdown statement when the importer captured one. Empty for image-only questions. */
  questionText: string;
  /** LaTeX fragments found in the text fields, passed through verbatim. */
  latexContent: string;
  /** Option labels (A, B, C, D, … or the paper's own counters). */
  options: string[];
  /** True when option *content* lives inside the images rather than text. */
  optionsInImages: boolean;
  imageAssets: QuestionImageAsset[];
  diagramAssets: QuestionImageAsset[];
  markingScheme: string;
  sectionInstruction?: string;
  hasAnswerKey: boolean;
  /** Official answer, formatted for humans. Null unless the user explicitly selected answer verification. */
  answerKey: string | null;
  /** The student's committed answer label. Only set in review/verify workflows. */
  userAnswerLabel?: string | null;
  /** Imported solution text from the ZIP. Only included in verification workflows — it can reveal the answer. */
  importedSolution?: string | null;
  jeeSystemPrompt: string;
};

export type AssembleQuestionContextInput = {
  test: Pick<StoredTest, "id" | "name" | "examType" | "kind">;
  question: Question;
  displayNumber?: number | null;
  images?: QuestionImageAsset[];
  /** Verification workflow only. Never enabled from the exam room. */
  includeAnswerKey?: boolean;
  userAnswerLabel?: string | null;
  sectionInstruction?: string;
};

function imageFileName(index: number, mimeType: string) {
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  return `question-image-${index}.${ext}`;
}

/** Build the complete QuestionContext for one question (pure). */
export function assembleQuestionContext(input: AssembleQuestionContextInput): QuestionContext {
  const { test, question } = input;
  const imageAssets: QuestionImageAsset[] = (input.images ?? []).map((asset, index) => ({
    ...asset,
    order: index + 1,
    role: index === 0 ? "question" : "figure",
    fileName: asset.fileName || imageFileName(index + 1, asset.mimeType || "image/png"),
  }));

  // Some ZIPs carry a text statement alongside images; pass it through when present.
  const extended = question as Question & { text?: unknown; statement?: unknown; questionText?: unknown };
  const rawText = [extended.text, extended.statement, extended.questionText]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const questionText = rawText.join("\n\n").trim();
  const latexContent = rawText.filter((text) => /\\[[(]|\$\$|\\frac|\\int|\\sqrt/.test(text)).join("\n\n");

  const options: string[] = [];
  if (question.type === "matrix_match") {
    for (let row = 1; row <= Math.max(1, question.msmRows); row += 1) {
      options.push(optionLabel(row, question.counterPrimary));
    }
  } else if (question.optionCount > 0) {
    for (let option = 1; option <= question.optionCount; option += 1) {
      options.push(optionLabel(option, question.counterPrimary));
    }
  }

  const includeKey = Boolean(input.includeAnswerKey) && question.correctAnswer.kind !== "missing";
  let answerKey: string | null = null;
  if (includeKey) {
    answerKey = formatOfficialAnswer(question);
    if (question.correctAnswer.kind === "bonus") answerKey = "BONUS";
    if (question.correctAnswer.kind === "dropped") answerKey = "DROPPED";
  }

  return {
    questionId: question.id,
    displayNumber: input.displayNumber ?? question.number ?? null,
    subject: question.canonicalSubject || question.subject,
    section: question.section,
    ...(question.topic ? { chapter: question.topic } : {}),
    ...(question.concept ? { concept: question.concept } : {}),
    examType: test.examType,
    ...(test.kind ? { testKind: test.kind } : {}),
    testName: test.name,
    questionType: question.type,
    questionTypeLabel: typeLabel(question.type),
    matrixRows: Math.max(1, question.msmRows),
    matrixColumns: Math.max(1, question.msmCols),
    questionText,
    latexContent,
    options,
    optionsInImages: imageAssets.length > 0,
    imageAssets,
    diagramAssets: imageAssets.filter((asset) => asset.role === "figure"),
    markingScheme: markingText(question),
    ...(input.sectionInstruction ? { sectionInstruction: input.sectionInstruction } : {}),
    hasAnswerKey: question.hasAnswerKey,
    answerKey,
    ...(input.userAnswerLabel != null ? { userAnswerLabel: input.userAnswerLabel } : {}),
    ...(includeKey && question.solution ? { importedSolution: question.solution } : {}),
    jeeSystemPrompt: JEE_SOLVER_SYSTEM_PROMPT,
  };
}

function optionBlock(context: QuestionContext) {
  const type = context.questionType;
  if (type === "numerical") {
    return "### Answer format\nThis is a **numerical-answer** question: no options are given. Compute the value and state it with the precision the question asks for.";
  }
  if (type === "matrix_match") {
    return `### Answer format\nThis is a **matrix-match** question with ${context.matrixRows} rows and ${context.matrixColumns} columns. Match each row to every correct column and evaluate every row independently.`;
  }
  const labels = context.options.join(", ");
  const multiNote = type === "multiple_correct"
    ? "More than one option may be correct — evaluate every option independently."
    : type === "objective"
      ? "The single/multiple-correct status is unknown, so evaluate every option independently."
      : "Exactly one option is correct.";
  const imageNote = context.optionsInImages
    ? " The option content is inside the question images — read it from there; do not invent option text."
    : "";
  return `### Options\nThere are ${context.options.length} options, labeled ${labels}. ${multiNote}${imageNote}`;
}

function statementBlock(context: QuestionContext) {
  const assets = context.imageAssets;
  const lines: string[] = [];

  if (context.questionText) {
    lines.push(`### Question statement\n${context.questionText}`);
  }

  if (assets.length === 0) {
    if (!context.questionText) {
      return "### Question statement\nNo machine-readable question text was imported and no images are attached. Say so and stop — do not invent a question.";
    }
    return lines.join("\n\n");
  }

  const missing = assets.filter((asset) => asset.missing);
  const imageLines = [
    `The complete question is provided as ${assets.length} image(s) in original order — image 1 is the main question; any further images contain the continuation, figures, graphs, tables, or options. Read every attached image completely before answering.`,
  ];
  if (missing.length > 0) {
    imageLines.push(
      `**Warning:** ${missing.length} of ${assets.length} image(s) (image ${missing.map((asset) => asset.order).join(", ")}) could not be loaded from this browser and are NOT attached. Explicitly state which parts of the question are missing instead of guessing.`,
    );
  } else {
    imageLines.push(`All ${assets.length} image(s) are attached at their original, full resolution.`);
  }
  lines.push(imageLines.join("\n\n"));
  return lines.join("\n\n");
}

function verificationBlock(context: QuestionContext) {
  if (context.answerKey == null) return "";
  const lines = [
    "### Official answer key (verification mode — selected by the user)",
    `Official correct answer: ${context.answerKey}`,
  ];
  if (context.userAnswerLabel != null) lines.push(`Student's answer in this attempt: ${context.userAnswerLabel || "—"}`);
  if (context.importedSolution) {
    lines.push(`Imported solution text from the paper (may reveal the answer):\n"""\n${context.importedSolution}\n"""`);
  }
  lines.push(
    "Solve the question independently first. Then compare your result with the official key above and clearly flag any discrepancy instead of forcing agreement.",
  );
  return lines.join("\n");
}

function metadataBlock(context: QuestionContext) {
  return [
    `- Exam: ${examLabel(context.examType)}`,
    `- Test: ${context.testName}`,
    `- Subject: ${context.subject}`,
    ...(context.section ? [`- Section: ${context.section}`] : []),
    ...(context.chapter ? [`- Chapter/Topic: ${context.chapter}`] : []),
    ...(context.concept ? [`- Concept: ${context.concept}`] : []),
    `- Question type: ${context.questionTypeLabel}`,
    `- Marking scheme: ${context.markingScheme}`,
    ...(context.sectionInstruction ? [`- Section instruction: ${context.sectionInstruction}`] : []),
    `- Question ID: ${context.questionId}`,
  ].join("\n");
}

function requiredOutputBlock(context: QuestionContext) {
  return [
    "## Required output structure",
    "- **Question interpretation** (transcribe the question, including data from every image)",
    "- **Concepts used**",
    "- **Step-by-step solution** (LaTeX for equations, SI units, dimensional checks)",
    `- **Option-wise analysis**${context.questionType === "numerical" ? " (not applicable — numerical answer)" : " (evaluate every option independently)"}`,
    "- **Final answer**",
    "- **Verification** (substitution, alternative method, or dimensional analysis)",
    "- **JEE shortcut or common trap** (when useful)",
  ].join("\n");
}

/** User-turn prompt for the built-in IJEE AI (the system prompt is applied server-side). */
export function buildJeeUserPrompt(context: QuestionContext, extra?: { followUp?: string }): string {
  const parts: string[] = [
    "Solve this JEE question completely and rigorously, following the JEE solver rules you were given.",
    metadataBlock(context),
    statementBlock(context),
    optionBlock(context),
  ];
  const verification = verificationBlock(context);
  if (verification) parts.push(verification);
  if (context.latexContent && context.latexContent !== context.questionText) {
    parts.push(`### LaTeX content captured with the question\n${context.latexContent}`);
  }
  parts.push(requiredOutputBlock(context));
  if (extra?.followUp) {
    parts.push(`## Follow-up\n${extra.followUp}`);
  }
  return parts.filter((part) => part.trim() !== "").join("\n\n");
}

/** Compact text of the question itself — no solver rules, no answer key. */
export function buildQuestionTextOnly(context: QuestionContext): string {
  const parts: string[] = [];
  if (context.questionText) {
    parts.push(context.questionText);
  } else if (context.imageAssets.length > 0) {
    parts.push(
      `(This question is provided as ${context.imageAssets.length} image(s) — attach them so the assistant can read the full statement, figures, and options.)`,
    );
  }
  const optionLine = context.options.length
    ? `Options: ${context.options.join(", ")}${context.optionsInImages ? " (option content is in the images)" : ""}`
    : "Numerical-answer question (no options).";
  parts.push(optionLine);
  parts.push(`${context.subject} · ${context.questionTypeLabel} · ${examLabel(context.examType)}`);
  return parts.filter((part) => part.trim() !== "").join("\n\n");
}

/**
 * Complete prompt for external AI providers: the JEE system prompt inline
 * (external chats have no system channel) plus the full question context.
 * The answer key is included only when the user selected verification mode.
 */
export function buildExternalJeePrompt(context: QuestionContext): string {
  const imageNote = context.imageAssets.length
    ? context.imageAssets.some((asset) => asset.missing)
      ? "NOTE FOR THE ASSISTANT: this question originally has images, but some could not be loaded. Ask me to re-attach them or state what is missing."
      : "NOTE FOR THE ASSISTANT: this question is provided as images. After pasting this prompt, attach the original question image(s) from my device before answering; read all of them."
    : "";
  return [
    JEE_SOLVER_SYSTEM_PROMPT,
    "---",
    "# JEE question to solve",
    imageNote,
    buildJeeUserPrompt(context),
  ]
    .filter((part) => part.trim() !== "")
    .join("\n\n");
}

/** Google Search query: question text plus subject/exam keywords. */
export function buildGoogleSearchQuery(context: QuestionContext): { query: string; textOnly: boolean } {
  const keywords = ["JEE", examLabel(context.examType), context.subject].filter(Boolean).join(" ");
  const text = context.questionText.replace(/\s+/g, " ").trim();
  if (text) {
    const trimmed = text.length > 320 ? `${text.slice(0, 317)}…` : text;
    return { query: `${trimmed} ${keywords}`, textOnly: false };
  }
  const topic = context.chapter ? ` ${context.chapter}` : "";
  return {
    query: `${context.subject}${topic} ${examLabel(context.examType)} question JEE`,
    textOnly: true,
  };
}

export type HandoffUrl = { url: string; truncated: boolean };

/**
 * Browsers and providers cap URL length (Claude truncates q around 14,000
 * characters). Stay far below that and tell the UI when truncation happened.
 */
export const MAX_URL_PROMPT_CHARS = 12_000;

const TRUNCATION_MARKER =
  "\n\n[…prompt truncated to fit the URL — use “Copy question prompt” for the full text…]";

function withPromptParam(origin: string, param: string, prompt: string): HandoffUrl {
  const promptLimited = prompt.length > MAX_URL_PROMPT_CHARS
    ? prompt.slice(0, MAX_URL_PROMPT_CHARS).trimEnd() + TRUNCATION_MARKER
    : prompt;
  return {
    url: `${origin}?${param}=${encodeURIComponent(promptLimited)}`,
    truncated: prompt.length > MAX_URL_PROMPT_CHARS,
  };
}

/** Google Search receives text only — image questions degrade to subject/chapter keywords. */
export function buildGoogleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

/** ChatGPT officially supports ?q= prefill (fills the composer; it does not upload images). */
export function buildChatGptUrl(prompt: string): HandoffUrl {
  return withPromptParam("https://chatgpt.com/", "q", prompt);
}

/** Claude supports ?q= prefill on /new (fills the composer; it does not upload images). */
export function buildClaudeUrl(prompt: string): HandoffUrl {
  return withPromptParam("https://claude.ai/new", "q", prompt);
}

/**
 * Gemini does NOT support URL prompt prefill — verified against Gemini's web
 * app behavior (no documented q/prompt parameter). Always a plain open URL.
 */
export function buildGeminiUrl(): string {
  return "https://gemini.google.com/app";
}

/** Safe diagnostic view of a context: never includes base64 payloads or the answer key. */
export function describeContextForLogs(context: QuestionContext) {
  return {
    questionId: context.questionId,
    subject: context.subject,
    questionType: context.questionType,
    images: context.imageAssets.map((asset) => ({
      order: asset.order,
      role: asset.role,
      missing: asset.missing,
      byteSize: asset.byteSize,
    })),
    answerKeyIncluded: context.answerKey != null,
  };
}
