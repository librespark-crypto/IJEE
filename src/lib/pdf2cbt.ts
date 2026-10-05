import JSZip from "jszip";
import { canonicalSubject, examLabel, markingText, slug, typeLabel } from "./format";
import type {
  AnswerKeyDraft,
  AnswerKeyEntry,
  CropJob,
  ExamType,
  ImportDraft,
  Question,
  QuestionMarks,
  QuestionType,
  StoredTest,
  TestKind,
  TestSection,
  ValidationItem,
} from "./types";
import {
  answerKeyEntry,
  combineQuestionType,
  parseOfficialAnswer,
  resolveQuestionType,
} from "./question-normalizer";

const SEPARATOR = "__--__";

type RawQuestion = {
  que?: number;
  type?: string;
  questionType?: string;
  answerOptions?: string;
  marks?: Record<string, unknown>;
  pdfData?: { page?: number; x1?: number; y1?: number; x2?: number; y2?: number }[];
  answerOptionsCounterType?: { primary?: string; secondary?: string };
  solution?: unknown;
  explanation?: unknown;
  solutionText?: unknown;
  sol?: unknown;
  topic?: unknown;
  chapter?: unknown;
  concept?: unknown;
  result?: { correctAnswer?: unknown };
};

type Walked = {
  subject: string;
  section: string;
  key: string;
  raw: RawQuestion;
};

function basename(path: string) {
  const clean = path.replace(/\\/g, "/");
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean;
}

function toNum(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readMarks(raw: unknown): { marks: QuestionMarks | null; imMissing: boolean } {
  const record = asRecord(raw);
  if (!record) return { marks: null, imMissing: true };
  const cm = toNum(record.cm ?? record.correct ?? record.positive);
  const imValue = record.im ?? record.incorrect ?? record.negative;
  const im = toNum(imValue);
  if (cm == null) return { marks: null, imMissing: im == null };
  const pm = toNum(record.pm ?? record.partial);
  const max = toNum(record.max);
  return {
    marks: {
      cm,
      im: im ?? 0,
      ...(pm != null ? { pm } : {}),
      ...(max != null ? { max } : {}),
    },
    imMissing: im == null,
  };
}

function parseOptions(raw: unknown, type: QuestionType) {
  const text = typeof raw === "string" ? raw : "";
  const parts = text
    .toLowerCase()
    .split("x")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  if (type === "numerical") return { optionCount: 0, msmRows: 1, msmCols: 1 };
  if (type === "matrix_match") {
    const rows = parts[0] || 4;
    const cols = parts[1] || parts[0] || 4;
    return { optionCount: rows, msmRows: rows, msmCols: cols };
  }
  const count = parts[0] || 4;
  return { optionCount: count, msmRows: 1, msmCols: 1 };
}

function walkTree(tree: unknown): Walked[] {
  const rows: Walked[] = [];
  const subjects = asRecord(tree);
  if (!subjects) return rows;
  for (const [subject, sectionNode] of Object.entries(subjects)) {
    const sections = asRecord(sectionNode);
    if (!sections) continue;
    for (const [section, questionNode] of Object.entries(sections)) {
      const questions = asRecord(questionNode);
      if (!questions) continue;
      for (const [key, raw] of Object.entries(questions)) {
        const question = asRecord(raw);
        if (!question) continue;
        rows.push({ subject, section, key, raw: question as RawQuestion });
      }
    }
  }
  return rows;
}

function configOf(json: Record<string, unknown>) {
  return asRecord(json.testConfig) ?? {};
}

function optionalOf(config: Record<string, unknown>, subject: string, section: string) {
  const additional = asRecord(config.additionalData);
  const subjectNode = additional ? asRecord(additional[subject]) : null;
  const sections = subjectNode ? asRecord(subjectNode.sections) : null;
  const sectionNode = sections ? asRecord(sections[section]) : null;
  const count = toNum(sectionNode?.optionalQuestions);
  return count && count > 0 ? count : 0;
}

function instructionOf(config: Record<string, unknown>, subject: string, section: string) {
  const additional = asRecord(config.additionalData);
  const subjectNode = additional ? asRecord(additional[subject]) : null;
  const sections = subjectNode ? asRecord(subjectNode.sections) : null;
  const sectionNode = sections ? asRecord(sections[section]) : null;
  const instructions = sectionNode ? asRecord(sectionNode.instructions) : null;
  return textOf(instructions?.type);
}

function answerNode(json: Record<string, unknown>, subject: string, section: string, key: string, number?: number) {
  const tree = asRecord(json.testAnswerKey);
  const subjectNode = tree ? asRecord(tree[subject]) : null;
  const sectionNode = subjectNode ? asRecord(subjectNode[section]) : null;
  if (!sectionNode) return undefined;
  return sectionNode[key] ?? (number == null ? undefined : sectionNode[String(number)]);
}

function detectExam(name: string, questions: Question[]): ExamType {
  const n = name.toLowerCase();
  if (/\badv(anced)?\b/.test(n) || n.includes("jee advanced")) return "jee-advanced";
  if (n.includes("main")) return "jee-main";
  if (questions.some((q) => q.type === "multiple_correct" || q.type === "matrix_match" || (q.marks.pm ?? 0) > 0)) return "jee-advanced";
  const singleCorrect = questions.filter((q) => q.type === "single_correct");
  if (singleCorrect.length && singleCorrect.every((q) => Math.abs(q.marks.cm) === 4 && Math.abs(q.marks.im) === 1)) return "jee-main";
  return "custom";
}

function detectKind(questions: Question[]): TestKind {
  const subjects = new Set(questions.map((q) => q.canonicalSubject));
  const pcm = ["Physics", "Chemistry", "Mathematics"].every((s) => subjects.has(s));
  if (pcm && questions.length >= 45) return "full";
  if (subjects.size <= 1) return questions.length <= 15 ? "practice" : "part";
  if (questions.length < 30) return "practice";
  return pcm ? "practice" : "part";
}

function defaultDuration(kind: TestKind, exam: ExamType, count: number) {
  if (kind === "full") return exam === "custom" ? 7200 : 10800;
  return Math.max(15 * 60, count * 2 * 60);
}

export function answerIndexKey(subject: string, section: string, number: number) {
  return `${subject}:::${section}:::${number}`;
}

function toBlob(bytes: Uint8Array, type: string) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type });
}

async function readZip(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const byBase = new Map<string, JSZip.JSZipObject>();
  for (const entry of entries) {
    const base = basename(entry.name);
    if (!byBase.has(base)) byBase.set(base, entry);
  }
  return { entries, byBase };
}

function findJsonEntry(byBase: Map<string, JSZip.JSZipObject>) {
  return byBase.get("data.json") ?? byBase.get("Data.json") ?? [...byBase.entries()].find(([name]) => name.toLowerCase().endsWith(".json"))?.[1];
}

function findPdfEntry(byBase: Map<string, JSZip.JSZipObject>) {
  return byBase.get("questions.pdf") ?? [...byBase.values()].find((entry) => basename(entry.name).toLowerCase().endsWith(".pdf"));
}

async function findImage(
  byBase: Map<string, JSZip.JSZipObject>,
  section: string,
  questionKey: string,
  index: number,
) {
  const names = [
    `${section}${SEPARATOR}${questionKey}${SEPARATOR}${index}.png`,
    `${section}${SEPARATOR}${questionKey}${SEPARATOR}${index}.jpg`,
    `${section}${SEPARATOR}${questionKey}${SEPARATOR}${index}.jpeg`,
    `${section}${SEPARATOR}${questionKey}${SEPARATOR}${index}.webp`,
  ];
  for (const name of names) {
    const hit = byBase.get(name);
    if (hit) return hit;
    const lower = name.toLowerCase();
    for (const [base, entry] of byBase) {
      if (base.toLowerCase() === lower) return entry;
    }
  }
  return undefined;
}

export async function parseUpload(file: File): Promise<ImportDraft | AnswerKeyDraft> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json")) {
    const json = JSON.parse(await file.text()) as unknown;
    return parseJson(json, file.name, new Map(), null);
  }
  if (!lower.endsWith(".zip")) {
    throw new Error("Upload a PDF2CBT .zip, or a data.json answer-key file.");
  }
  let zip: Awaited<ReturnType<typeof readZip>>;
  try {
    zip = await readZip(file);
  } catch {
    throw new Error("This file is not a readable ZIP. PDF2CBT downloads a ZIP containing data.json.");
  }
  const jsonEntry = findJsonEntry(zip.byBase);
  if (!jsonEntry) {
    return blocked(file.name, "data.json was not found in the ZIP.");
  }
  let json: unknown;
  try {
    json = JSON.parse(await jsonEntry.async("string"));
  } catch {
    return blocked(file.name, "data.json is not valid JSON.");
  }
  const pdfEntry = findPdfEntry(zip.byBase);
  const pdfBytes = pdfEntry ? new Uint8Array(await pdfEntry.async("uint8array")) : null;
  return parseJson(json, file.name, zip.byBase, pdfBytes);
}

function blocked(filename: string, reason: string): ImportDraft {
  const test = emptyTest(filename, reason);
  return {
    kind: "test",
    test,
    images: [],
    cropJobs: [],
    pdfBytes: null,
    report: test.validation,
    blocking: [reason],
  };
}

function emptyTest(filename: string, reason: string): StoredTest {
  return {
    id: crypto.randomUUID(),
    name: filename.replace(/\.zip$/i, ""),
    examType: "custom",
    kind: "practice",
    durationSeconds: 3600,
    createdAt: Date.now(),
    sourceFile: filename,
    subjects: [],
    sections: [],
    questions: [],
    validation: [{ label: "ZIP Validation", status: "fail", detail: reason }],
  };
}

async function parseJson(
  json: unknown,
  filename: string,
  byBase: Map<string, JSZip.JSZipObject>,
  pdfBytes: Uint8Array | null,
): Promise<ImportDraft | AnswerKeyDraft> {
  const root = asRecord(json);
  if (!root) return blocked(filename, "The JSON root is not an object.");
  const cropper = root.pdfCropperData;
  const testData = root.testData ?? root.testResultData;
  const walked = walkTree(cropper).length ? walkTree(cropper) : walkTree(testData);
  if (!walked.length) {
    if (root.testAnswerKey) {
      return answerKeyOnly(root, filename);
    }
    return blocked(filename, "No pdfCropperData or testData question tree was found. This is not a PDF2CBT test ZIP.");
  }

  const config = configOf(root);
  const testId = crypto.randomUUID();
  const questions: Question[] = [];
  const images: { id: string; blob: Blob }[] = [];
  const cropJobs: CropJob[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  let imMissing = 0;
  let keyed = 0;

  // Preserve subject/section appearance order, but sort questions numerically inside a section.
  const grouped = new Map<string, Walked[]>();
  for (const row of walked) {
    const id = `${row.subject}:::${row.section}`;
    const list = grouped.get(id) ?? [];
    list.push(row);
    grouped.set(id, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => (toNum(a.key) ?? a.raw.que ?? 0) - (toNum(b.key) ?? b.raw.que ?? 0));
  }

  for (const [, list] of grouped) {
    for (const row of list) {
      const number = toNum(row.raw.que) ?? toNum(row.key);
      const keyRaw = answerNode(root, row.subject, row.section, row.key, number ?? undefined);
      const keyEntry = answerKeyEntry(keyRaw);
      const resultEntry = answerKeyEntry(row.raw.result?.correctAnswer);
      const sourceType = combineQuestionType(
        row.raw.type ?? row.raw.questionType,
        keyEntry.declaredType ?? resultEntry.declaredType,
      );
      if (!sourceType || number == null) {
        failures.push(`${row.subject} / ${row.section} / ${row.key}: missing question type or number.`);
        continue;
      }
      const marksRead = readMarks(row.raw.marks);
      if (!marksRead.marks) {
        failures.push(`${row.subject} / ${row.section} / Q${number}: marking scheme is missing cm/im.`);
        continue;
      }
      if (marksRead.imMissing) imMissing += 1;
      const counter = row.raw.answerOptionsCounterType;
      const counterPrimary = counter?.primary && counter.primary !== "default" ? counter.primary : undefined;
      const options = parseOptions(row.raw.answerOptions, sourceType);
      const fromKey = parseOfficialAnswer(keyRaw, sourceType, options.optionCount, counterPrimary);
      const fromResult = parseOfficialAnswer(row.raw.result?.correctAnswer, sourceType, options.optionCount, counterPrimary);
      const answer = fromKey.kind === "missing" ? fromResult : fromKey;
      const type = resolveQuestionType(sourceType, answer);
      if (answer.kind !== "missing") keyed += 1;
      const qid = `${testId}:${slug(row.subject)}:${slug(row.section)}:${number}`;
      const pdfData = Array.isArray(row.raw.pdfData) ? row.raw.pdfData : [];
      const imageIds: string[] = [];
      for (let i = 1; i <= (pdfData.length || 1); i += 1) {
        const imageId = `${qid}:img:${i}`;
        const keys = [row.key, String(number)];
        let entry: JSZip.JSZipObject | undefined;
        for (const key of keys) {
          entry = await findImage(byBase, row.section, key, i);
          if (entry) break;
        }
        if (entry) {
          const bytes = new Uint8Array(await entry.async("uint8array"));
          const ext = basename(entry.name).split(".").pop()?.toLowerCase();
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
          images.push({ id: imageId, blob: toBlob(bytes, mime) });
          imageIds.push(imageId);
          continue;
        }
        const crop = pdfData[i - 1];
        if (crop && pdfBytes && toNum(crop.page) && toNum(crop.x1) != null && toNum(crop.y1) != null && toNum(crop.x2) != null && toNum(crop.y2) != null) {
          cropJobs.push({
            imageId,
            page: Number(crop.page),
            x1: Number(crop.x1),
            y1: Number(crop.y1),
            x2: Number(crop.x2),
            y2: Number(crop.y2),
            label: `${row.section} Q${number} image ${i}`,
          });
          imageIds.push(imageId);
          continue;
        }
        if (pdfData.length === 0 && i === 1) {
          failures.push(`${row.section} Q${number}: no image and no crop coordinates.`);
        } else {
          failures.push(`${row.section} Q${number}: image ${i} is missing and cannot be cropped.`);
        }
      }
      if (!imageIds.length) continue;
      questions.push({
        id: qid,
        subject: row.subject,
        canonicalSubject: canonicalSubject(row.subject),
        section: row.section,
        number,
        type,
        marks: marksRead.marks,
        optionCount: options.optionCount,
        msmRows: options.msmRows,
        msmCols: options.msmCols,
        counterPrimary,
        counterSecondary: counter?.secondary && counter.secondary !== "default" ? counter.secondary : undefined,
        correctAnswer: answer,
        hasAnswerKey: answer.kind !== "missing",
        imageIds,
        solution: textOf(row.raw.solution) ?? textOf(row.raw.explanation) ?? textOf(row.raw.solutionText) ?? textOf(row.raw.sol),
        topic: textOf(row.raw.topic) ?? textOf(row.raw.chapter),
        concept: textOf(row.raw.concept),
      });
    }
  }

  if (!questions.length && !failures.length) {
    failures.push("The ZIP parsed, but no usable questions were found.");
  }

  const sections: TestSection[] = [];
  for (const [id, list] of grouped) {
    const [subject, section] = id.split(":::");
    const ids = questions.filter((q) => q.subject === subject && q.section === section).map((q) => q.id);
    if (!ids.length) continue;
    sections.push({
      subject: subject ?? "",
      name: section ?? "",
      optionalQuestions: optionalOf(config, subject ?? "", section ?? ""),
      instructionType: instructionOf(config, subject ?? "", section ?? ""),
      questionIds: ids,
    });
  }

  const name = textOf(config.testName) || filename.replace(/\.(zip|json)$/i, "") || "Untitled JEE paper";
  const examType = detectExam(name, questions);
  const kind = detectKind(questions);
  const givenDuration = toNum(config.testDurationInSeconds) ?? toNum(config.durationInSeconds);
  const durationSeconds = givenDuration && givenDuration >= 60 ? givenDuration : defaultDuration(kind, examType, questions.length);

  const report = buildReport({
    questions,
    sections,
    keyed,
    failures,
    warnings,
    imMissing,
    cropJobs: cropJobs.length,
    pdf: Boolean(pdfBytes),
    images: images.length,
  });
  const blocking = failures.slice();
  if (!questions.length) blocking.push("No questions could be imported.");

  const subjects = [...new Set(questions.map((q) => q.canonicalSubject))];
  const test: StoredTest = {
    id: testId,
    name,
    examType,
    kind,
    durationSeconds,
    createdAt: Date.now(),
    sourceFile: filename,
    appVersion: textOf(root.appVersion),
    generatedBy: textOf(root.generatedBy),
    subjects,
    sections,
    questions,
    validation: report,
  };
  return { kind: "test", test, images, cropJobs, pdfBytes, report, blocking };
}

function buildReport(input: {
  questions: Question[];
  sections: TestSection[];
  keyed: number;
  failures: string[];
  warnings: string[];
  imMissing: number;
  cropJobs: number;
  pdf: boolean;
  images: number;
}): ValidationItem[] {
  const items: ValidationItem[] = [];
  const bySubject = new Map<string, Question[]>();
  for (const question of input.questions) {
    const list = bySubject.get(question.canonicalSubject) ?? [];
    list.push(question);
    bySubject.set(question.canonicalSubject, list);
  }
  for (const subject of ["Physics", "Chemistry", "Mathematics"]) {
    const list = bySubject.get(subject) ?? [];
    if (!list.length && bySubject.size && !input.questions.some((q) => q.canonicalSubject === subject)) {
      items.push({ label: subject, status: "warn", detail: "Not in this ZIP." });
      continue;
    }
    if (list.length) {
      const types = countTypes(list);
      items.push({
        label: subject,
        status: "pass",
        detail: `${list.length} questions · ${types}`,
      });
    }
  }
  for (const [subject, list] of bySubject) {
    if (["Physics", "Chemistry", "Mathematics"].includes(subject)) continue;
    items.push({ label: subject, status: "pass", detail: `${list.length} questions · ${countTypes(list)}` });
  }
  const markingOk = input.questions.length > 0 && input.questions.every((q) => Number.isFinite(q.marks.cm));
  items.push({
    label: "Marking Scheme",
    status: markingOk ? (input.imMissing ? "warn" : "pass") : "fail",
    detail: markingOk
      ? input.imMissing
        ? `${input.questions.length - input.imMissing} questions have cm/im. ${input.imMissing} were missing incorrect marks and defaulted to 0.`
        : schemePreview(input.questions)
      : "Marking scheme missing on one or more questions.",
  });
  items.push({
    label: "Answer Key",
    status: input.keyed === 0 ? "warn" : input.keyed < input.questions.length ? "warn" : "pass",
    detail:
      input.keyed === 0
        ? "No answer key in this ZIP. The test can be attempted; scores stay blank until a key is attached."
        : input.keyed < input.questions.length
          ? `${input.keyed} of ${input.questions.length} questions have a key.`
          : `${input.keyed} answers found. Scoring will use this key, not an AI guess.`,
  });
  const optional = input.sections.filter((section) => section.optionalQuestions > 0);
  if (optional.length) {
    items.push({
      label: "Section rules",
      status: "pass",
      detail: optional.map((section) => `${section.name}: ${section.optionalQuestions} optional`).join(" · "),
    });
  }
  if (input.cropJobs) {
    items.push({
      label: "Images",
      status: input.pdf ? "warn" : "fail",
      detail: input.pdf
        ? `${input.images} embedded images. ${input.cropJobs} will be cropped from questions.pdf using PDF2CBT coordinates.`
        : `${input.cropJobs} question images are missing and questions.pdf was not in the ZIP.`,
    });
  } else if (input.images) {
    items.push({ label: "Images", status: "pass", detail: `${input.images} question images found.` });
  } else {
    items.push({ label: "Images", status: "fail", detail: "No question images found." });
  }
  const failed = input.failures.length > 0 || items.some((item) => item.status === "fail");
  items.push({
    label: "ZIP Validation",
    status: failed ? "fail" : "pass",
    detail: failed
      ? input.failures.slice(0, 4).join(" ") || "Validation failed."
      : input.warnings.length
        ? `Passed with notes. ${input.warnings.join(" ")}`
        : "Passed",
  });
  return items;
}

function countTypes(list: Question[]) {
  const counts = new Map<QuestionType, number>();
  for (const question of list) counts.set(question.type, (counts.get(question.type) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => `${count} ${typeLabel(type)}`).join(", ");
}

function schemePreview(questions: Question[]) {
  const unique = new Map<string, number>();
  for (const question of questions) {
    const text = markingText(question);
    unique.set(text, (unique.get(text) ?? 0) + 1);
  }
  return [...unique.entries()]
    .slice(0, 3)
    .map(([text, count]) => `${count} × ${text}`)
    .join(" · ");
}

function answerKeyOnly(root: Record<string, unknown>, filename: string): AnswerKeyDraft {
  const tree = asRecord(root.testAnswerKey);
  const answers: Record<string, AnswerKeyEntry> = {};
  let keyed = 0;
  if (tree) {
    for (const [subject, sectionNode] of Object.entries(tree)) {
      const sections = asRecord(sectionNode);
      if (!sections) continue;
      for (const [section, questionNode] of Object.entries(sections)) {
        const questions = asRecord(questionNode);
        if (!questions) continue;
        for (const [key, raw] of Object.entries(questions)) {
          const number = toNum(key);
          if (number == null || raw == null || raw === "") continue;
          const entry = answerKeyEntry(raw);
          if (asRecord(raw)?.kind === "missing") continue;
          answers[answerIndexKey(subject, section, number)] = entry;
          keyed += 1;
        }
      }
    }
  }
  return {
    kind: "answer-key",
    sourceName: filename,
    keyed,
    answers,
    report: [
      {
        label: "Answer Key",
        status: keyed ? "pass" : "fail",
        detail: keyed ? `${keyed} answers read. Attach this key to an imported test.` : "No answers were found.",
      },
    ],
  };
}

export function applyAnswerKey(test: StoredTest, answers: Record<string, AnswerKeyEntry>): StoredTest {
  let keyed = 0;
  const questions = test.questions.map((question) => {
    const direct = answers[answerIndexKey(question.subject, question.section, question.number)];
    const canonical = answers[answerIndexKey(question.canonicalSubject, question.section, question.number)];
    const entry = direct ?? canonical;
    if (!entry) return question;
    const sourceType = combineQuestionType(question.type, entry.declaredType);
    const correctAnswer = parseOfficialAnswer(entry.raw, sourceType, question.optionCount, question.counterPrimary);
    if (correctAnswer.kind === "missing") return question;
    const type = resolveQuestionType(sourceType, correctAnswer);
    keyed += 1;
    return { ...question, type, correctAnswer, hasAnswerKey: true };
  });
  const validation = test.validation.map((item) =>
    item.label === "Answer Key"
      ? {
          ...item,
          status: keyed === questions.length ? ("pass" as const) : keyed ? ("warn" as const) : item.status,
          detail: keyed
            ? `${keyed} of ${questions.length} questions now have an answer key.`
            : item.detail,
        }
      : item,
  );
  return { ...test, questions, validation };
}

export function describeExam(test: Pick<StoredTest, "examType" | "kind">) {
  return `${examLabel(test.examType)}`;
}
