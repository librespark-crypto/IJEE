import type {
  ExamType,
  OfficialAnswer,
  Question,
  QuestionStatus,
  QuestionType,
  ResultStatus,
  TestKind,
  UserAnswer,
} from "./types";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMarks(n: number) {
  if (!Number.isFinite(n)) return "—";
  const rounded = round2(n);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function formatPercent(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${round2(n).toFixed(1)}%`;
}

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return sec ? `${m}m ${sec}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min ? `${h}h ${min}m` : `${h}h`;
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function canonicalSubject(name: string) {
  const n = name.toLowerCase();
  if (n.includes("phys")) return "Physics";
  if (n.includes("chem")) return "Chemistry";
  if (n.includes("math")) return "Mathematics";
  return name.trim() || "General";
}

export function examLabel(exam: ExamType) {
  if (exam === "jee-main") return "JEE Main";
  if (exam === "jee-advanced") return "JEE Advanced";
  return "Custom";
}

export function kindLabel(kind: TestKind) {
  if (kind === "full") return "Full test";
  if (kind === "part") return "Part test";
  return "Practice";
}

export function typeLabel(type: QuestionType) {
  if (type === "mcq") return "Single Correct";
  if (type === "msq") return "MSQ";
  if (type === "nat") return "Numerical";
  return "Matrix";
}

export function typeShort(type: QuestionType) {
  if (type === "mcq") return "SCQ";
  if (type === "msq") return "MSQ";
  if (type === "nat") return "NAT";
  return "MSM";
}

export function statusLabel(status: QuestionStatus) {
  switch (status) {
    case "notVisited":
      return "Not Visited";
    case "notAnswered":
      return "Not Answered";
    case "answered":
      return "Answered";
    case "marked":
      return "Marked for Review";
    case "markedAnswered":
      return "Answered & Marked";
  }
}

export function resultLabel(status: ResultStatus) {
  switch (status) {
    case "correct":
      return "Correct";
    case "incorrect":
      return "Incorrect";
    case "partial":
      return "Partial";
    case "notAnswered":
      return "Unattempted";
    case "bonus":
      return "Bonus";
    case "dropped":
      return "Dropped";
    case "notConsidered":
      return "Not considered";
  }
}

const COUNTERS: Record<string, string[]> = {
  "upper-latin": "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  "lower-latin": "abcdefghijklmnopqrstuvwxyz".split(""),
  "upper-pqrs": "PQRSTUVWXYZ".split(""),
  "lower-pqrs": "pqrstuvwxyz".split(""),
  decimal: Array.from({ length: 30 }, (_, i) => String(i + 1)),
  "upper-roman": ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"],
  "lower-roman": ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"],
};

export function optionLabel(index1: number, counter = "upper-latin") {
  const list = COUNTERS[counter] ?? COUNTERS["upper-latin"];
  return list[index1 - 1] ?? String(index1);
}

export function questionMaxMarks(q: Pick<Question, "type" | "marks" | "msmRows">) {
  if (typeof q.marks.max === "number" && q.marks.max > 0) return Math.abs(q.marks.max);
  if (q.type === "msm") return Math.abs(q.marks.cm) * Math.max(1, q.msmRows || 1);
  return Math.abs(q.marks.cm);
}

export function markingText(q: Pick<Question, "type" | "marks" | "msmRows">) {
  const plus = formatMarks(Math.abs(q.marks.cm));
  const minus = formatMarks(Math.abs(q.marks.im));
  if (q.type === "msq") {
    const partial = q.marks.pm == null ? "no partial" : `partial +${formatMarks(Math.abs(q.marks.pm))} per correct option`;
    return `+${plus} all correct, ${partial}, −${minus} if any wrong option`;
  }
  if (q.type === "msm") {
    return `+${plus} per correct row, −${minus} per wrong row`;
  }
  if (q.type === "nat") {
    return Math.abs(q.marks.im) === 0 ? `+${plus}, no negative` : `+${plus} / −${minus}`;
  }
  return `+${plus} / −${minus}`;
}

export function answerIsEmpty(type: QuestionType, answer: UserAnswer | null) {
  if (!answer || answer.kind !== type) return true;
  if (answer.kind === "mcq") return !Number.isInteger(answer.option) || answer.option < 1;
  if (answer.kind === "msq") return answer.options.length === 0;
  if (answer.kind === "nat") {
    const value = answer.value.trim();
    if (!value) return true;
    return Number.isNaN(parseFloat(value));
  }
  return Object.values(answer.rows).every((cols) => cols.length === 0);
}

export function formatUserAnswer(q: Question, answer: UserAnswer | null) {
  if (answerIsEmpty(q.type, answer) || !answer) return "—";
  if (answer.kind === "mcq") return optionLabel(answer.option, q.counterPrimary);
  if (answer.kind === "msq") {
    return [...answer.options]
      .sort((a, b) => a - b)
      .map((n) => optionLabel(n, q.counterPrimary))
      .join(", ");
  }
  if (answer.kind === "nat") return answer.value.trim();
  return Object.entries(answer.rows)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .filter(([, cols]) => cols.length > 0)
    .map(([row, cols]) => {
      const rowLabel = optionLabel(Number(row), q.counterPrimary);
      const colLabel = [...cols]
        .sort((a, b) => a - b)
        .map((n) => optionLabel(n, q.counterSecondary || "upper-pqrs"))
        .join(", ");
      return `${rowLabel}: ${colLabel}`;
    })
    .join(" · ");
}

export function formatOfficialAnswer(q: Question, answer: OfficialAnswer = q.answer) {
  if (answer.kind === "missing") return "No key";
  if (answer.kind === "bonus") return "BONUS";
  if (answer.kind === "dropped") return "DROPPED";
  if (answer.kind === "choice") {
    const labels = [...answer.values]
      .sort((a, b) => a - b)
      .map((n) => optionLabel(n, q.counterPrimary));
    if (q.type === "mcq" && labels.length > 1) return labels.join(" or ");
    return labels.join(", ") || "—";
  }
  if (answer.kind === "nat") {
    return answer.raw
      .replace(/OR/gi, ",")
      .split(",")
      .map((part) => part.trim().replace(/TO/gi, " to "))
      .filter(Boolean)
      .join(" or ");
  }
  return Object.entries(answer.rows)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .filter(([, cols]) => cols.length > 0)
    .map(([row, cols]) => {
      const rowLabel = optionLabel(Number(row), q.counterPrimary);
      const colLabel = [...cols]
        .sort((a, b) => a - b)
        .map((n) => optionLabel(n, q.counterSecondary || "upper-pqrs"))
        .join(", ");
      return `${rowLabel}: ${colLabel}`;
    })
    .join(" · ");
}

export function subjectTone(subject: string) {
  const name = canonicalSubject(subject);
  if (name === "Physics") return { ink: "#1e3a5f", wash: "#e7eef8" };
  if (name === "Chemistry") return { ink: "#9a3412", wash: "#fde8df" };
  if (name === "Mathematics") return { ink: "#21543c", wash: "#e5f3eb" };
  return { ink: "#3f3a34", wash: "#f3eee6" };
}

export function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}
