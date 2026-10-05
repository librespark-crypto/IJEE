/**
 * Extended analytics computations for the Review Dashboard.
 * Computes difficulty classification, attempt quality buckets,
 * time buckets, subject movement timeline, question journey, and
 * painful question detection.
 */
import { round2 } from "./format";
import type { Attempt, BucketStats, Evaluation, QuestionAnalysis, QuestionType, ResultStatus, StoredTest } from "./types";

export type DifficultyLevel = "Easy" | "Moderate" | "Tough";

export type AttemptQuality = "perfect" | "wasted" | "overtime" | "confused";

export type DifficultyBreakdown = {
  level: DifficultyLevel;
  attempted: number;
  correct: number;
  incorrect: number;
  partial: number;
  unattempted: number;
  total: number;
  score: number;
  maxMarks: number;
};

export type AttemptQualityBucket = {
  quality: AttemptQuality;
  label: string;
  description: string;
  count: number;
  score: number;
  timeSpent: number;
  avgTime: number;
  questionIds: string[];
  bySubject: Record<string, number>;
};

export type TimeBucket = {
  label: string;
  startMinutes: number;
  endMinutes: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  score: number;
  timeSpent: number;
};

export type SubjectHop = {
  subject: string;
  section: string;
  questionCount: number;
  timeSpent: number;
  startIndex: number;
  endIndex: number;
};

export type QuestionVisit = {
  questionId: string;
  displayNumber: number;
  subject: string;
  section: string;
  timeSpent: number;
  status: ResultStatus;
  marks: number;
  order: number;
};

export type PainfulQuestion = {
  questionId: string;
  displayNumber: number;
  subject: string;
  section: string;
  timeSpent: number;
  marks: number;
  status: ResultStatus;
  reason: string;
};

export type TimeQuality = {
  correctTime: number;
  incorrectTime: number;
  unattemptedTime: number;
  totalTime: number;
  correctPct: number;
  incorrectPct: number;
  unattemptedPct: number;
};

export type PerformanceRow = {
  label: string;
  score: number;
  maxMarks: number;
  correct: number;
  incorrect: number;
  partial: number;
  unattempted: number;
  notVisited: number;
  notConsidered: number;
};

export type DashboardData = {
  difficulty: DifficultyBreakdown[];
  attemptQuality: AttemptQualityBucket[];
  timeBuckets: TimeBucket[];
  subjectMovement: SubjectHop[];
  questionJourney: QuestionVisit[];
  painfulQuestions: PainfulQuestion[];
  timeQuality: TimeQuality;
  performanceRows: PerformanceRow[];
  predictedPercentile: number;
  difficultyByQuestion: Map<string, DifficultyLevel>;
  attemptQualityByQuestion: Map<string, AttemptQuality>;
};

/**
 * Classify question difficulty based on type, marks, and observed time.
 */
export function classifyDifficulty(question: QuestionAnalysis, avgTime: number): DifficultyLevel {
  const timeRatio = avgTime > 0 ? question.timeSpent / avgTime : 1;
  const type: QuestionType = question.type;

  // Matrix match and multiple correct are inherently harder
  if (type === "matrix_match") return "Tough";
  if (type === "multiple_correct") {
    return timeRatio > 1.8 ? "Tough" : "Moderate";
  }
  if (type === "numerical") {
    if (timeRatio > 2.0 || Math.abs(question.maxMarks) >= 4) return "Moderate";
    return "Moderate";
  }
  // single_correct or objective
  if (timeRatio > 2.5) return "Moderate";
  return "Easy";
}

/**
 * Classify an attempt's quality.
 * - Perfect: Correct & within benchmark time
 * - Wasted: Incorrect & solved quickly (< 40% of avg time)
 * - Overtime: Spent more than 2x benchmark time
 * - Confused: Unattempted but spent significant time (> avg)
 */
export function classifyAttemptQuality(
  question: QuestionAnalysis,
  avgTime: number,
): AttemptQuality | null {
  const benchmarkTime = avgTime > 0 ? avgTime : 90;
  const isCorrect = question.status === "correct";
  const isIncorrect = question.status === "incorrect" || question.status === "partial";
  const isUnattempted = question.status === "notAnswered";
  const isAttempted = isCorrect || isIncorrect;

  if (question.status === "notConsidered" || question.status === "bonus" || question.status === "dropped") return null;
  if (question.timeSpent === 0 && !isAttempted) return null;

  if (isCorrect && question.timeSpent <= benchmarkTime * 1.5) return "perfect";
  if (isIncorrect && question.timeSpent < benchmarkTime * 0.4) return "wasted";
  if (isAttempted && question.timeSpent > benchmarkTime * 2.0) return "overtime";
  if (isUnattempted && question.timeSpent > benchmarkTime * 0.8) return "confused";
  if (isCorrect) return "perfect";
  return null;
}

function emptyDifficulty(level: DifficultyLevel): DifficultyBreakdown {
  return { level, attempted: 0, correct: 0, incorrect: 0, partial: 0, unattempted: 0, total: 0, score: 0, maxMarks: 0 };
}

function emptyQualityBucket(quality: AttemptQuality, label: string, description: string): AttemptQualityBucket {
  return { quality, label, description, count: 0, score: 0, timeSpent: 0, avgTime: 0, questionIds: [], bySubject: {} };
}

/**
 * Build subject movement hops from the ordered question list.
 * Groups consecutive questions in the same section.
 */
export function buildSubjectMovement(evaluation: Evaluation): SubjectHop[] {
  const questions = evaluation.questions;
  if (!questions.length) return [];
  const hops: SubjectHop[] = [];
  let current: SubjectHop = {
    subject: questions[0]!.canonicalSubject,
    section: questions[0]!.section,
    questionCount: 1,
    timeSpent: questions[0]!.timeSpent,
    startIndex: 0,
    endIndex: 0,
  };

  for (let i = 1; i < questions.length; i++) {
    const q = questions[i]!;
    const sameHop = q.canonicalSubject === current.subject && q.section === current.section;
    if (sameHop && q.timeSpent > 0) {
      current.questionCount += 1;
      current.timeSpent += q.timeSpent;
      current.endIndex = i;
    } else if (q.timeSpent > 0) {
      hops.push(current);
      current = {
        subject: q.canonicalSubject,
        section: q.section,
        questionCount: 1,
        timeSpent: q.timeSpent,
        startIndex: i,
        endIndex: i,
      };
    }
  }
  hops.push(current);
  return hops;
}

/**
 * Build a chronological question journey from the evaluation.
 */
export function buildQuestionJourney(evaluation: Evaluation): QuestionVisit[] {
  return evaluation.questions
    .filter((q) => q.timeSpent > 0 || q.status !== "notAnswered")
    .map((q, i) => ({
      questionId: q.questionId,
      displayNumber: q.displayNumber,
      subject: q.canonicalSubject,
      section: q.section,
      timeSpent: q.timeSpent,
      status: q.status,
      marks: q.marks,
      order: i,
    }));
}

/**
 * Find painful questions: high time spent with negative or no marks.
 */
export function findPainfulQuestions(evaluation: Evaluation): PainfulQuestion[] {
  const considered = evaluation.questions.filter((q) => q.status !== "notConsidered" && !q.missingKey);
  const avgTime = evaluation.avgTime || 90;
  const painfulThreshold = Math.max(120, avgTime * 2);

  return considered
    .filter((q) => {
      if (q.timeSpent < painfulThreshold) return false;
      return q.status === "incorrect" || q.status === "partial" || (q.status === "notAnswered" && q.timeSpent > painfulThreshold);
    })
    .sort((a, b) => b.timeSpent - a.timeSpent)
    .slice(0, 10)
    .map((q) => ({
      questionId: q.questionId,
      displayNumber: q.displayNumber,
      subject: q.canonicalSubject,
      section: q.section,
      timeSpent: q.timeSpent,
      marks: q.marks,
      status: q.status,
      reason: q.status === "notAnswered"
        ? `Spent ${Math.round(q.timeSpent / 60)}m but left blank`
        : `Spent ${Math.round(q.timeSpent / 60)}m and got ${round2(q.marks)} marks`,
    }));
}

/**
 * Build time buckets (30-minute intervals).
 */
export function buildTimeBuckets(evaluation: Evaluation, attempt: Attempt): TimeBucket[] {
  const totalTimeUsed = Math.max(0, attempt.durationSeconds - attempt.remainingSeconds);
  const totalMinutes = Math.ceil(totalTimeUsed / 60);
  const bucketCount = Math.max(1, Math.ceil(totalMinutes / 30));
  const buckets: TimeBucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    buckets.push({
      label: `${i * 30}–${(i + 1) * 30}m`,
      startMinutes: i * 30,
      endMinutes: (i + 1) * 30,
      attempted: 0,
      correct: 0,
      incorrect: 0,
      unattempted: 0,
      score: 0,
      timeSpent: 0,
    });
  }

  // Distribute questions across buckets based on cumulative time
  let cumulativeTime = 0;
  const sortedByTime = [...evaluation.questions].filter((q) => q.timeSpent > 0 || q.status !== "notAnswered");

  for (const q of sortedByTime) {
    const bucketIndex = Math.min(
      Math.floor((cumulativeTime / 60) / 30),
      buckets.length - 1,
    );
    const bucket = buckets[Math.max(0, bucketIndex)]!;
    bucket.timeSpent += q.timeSpent;
    bucket.score += q.marks;

    if (q.status === "correct") { bucket.attempted += 1; bucket.correct += 1; }
    else if (q.status === "incorrect" || q.status === "partial") { bucket.attempted += 1; bucket.incorrect += 1; }
    else if (q.status === "notAnswered") { bucket.unattempted += 1; }

    cumulativeTime += q.timeSpent;
  }

  return buckets;
}

/**
 * Build time quality distribution.
 */
export function buildTimeQuality(evaluation: Evaluation): TimeQuality {
  let correctTime = 0;
  let incorrectTime = 0;
  let unattemptedTime = 0;

  for (const q of evaluation.questions) {
    if (q.status === "correct" || q.status === "bonus") correctTime += q.timeSpent;
    else if (q.status === "incorrect" || q.status === "partial") incorrectTime += q.timeSpent;
    else unattemptedTime += q.timeSpent;
  }

  const totalTime = correctTime + incorrectTime + unattemptedTime || 1;
  return {
    correctTime,
    incorrectTime,
    unattemptedTime,
    totalTime,
    correctPct: round2((correctTime / totalTime) * 100),
    incorrectPct: round2((incorrectTime / totalTime) * 100),
    unattemptedPct: round2((unattemptedTime / totalTime) * 100),
  };
}

/**
 * Build performance rows: Overall + each subject.
 */
export function buildPerformanceRows(evaluation: Evaluation): PerformanceRow[] {
  const overall: PerformanceRow = {
    label: "Overall",
    score: evaluation.score,
    maxMarks: evaluation.maxMarks,
    correct: evaluation.correct,
    incorrect: evaluation.incorrect,
    partial: evaluation.partial,
    unattempted: evaluation.unattempted,
    notVisited: 0,
    notConsidered: evaluation.notConsidered,
  };
  const rows: PerformanceRow[] = [overall];
  for (const subject of evaluation.subjects) {
    rows.push({
      label: subject.name,
      score: subject.score,
      maxMarks: subject.maxMarks,
      correct: subject.correct,
      incorrect: subject.incorrect,
      partial: subject.partial,
      unattempted: subject.unattempted,
      notVisited: 0,
      notConsidered: subject.notConsidered,
    });
  }
  return rows;
}

/**
 * Rough percentile prediction based on score percentage.
 * This is a heuristic, not a real percentile.
 */
export function predictPercentile(percentage: number): number {
  if (percentage >= 95) return 99.5;
  if (percentage >= 85) return 98;
  if (percentage >= 75) return 96;
  if (percentage >= 65) return 92;
  if (percentage >= 55) return 85;
  if (percentage >= 45) return 75;
  if (percentage >= 35) return 60;
  if (percentage >= 25) return 45;
  if (percentage >= 15) return 30;
  if (percentage >= 5) return 15;
  return Math.max(0, round2(percentage));
}

/**
 * Master function: build all dashboard data.
 */
export function buildDashboardData(
  _test: StoredTest,
  attempt: Attempt,
  evaluation: Evaluation,
): DashboardData {
  const avgTime = evaluation.avgTime || 90;

  // Difficulty classification
  const difficultyMap = new Map<string, DifficultyLevel>();
  const difficultyBuckets: Record<DifficultyLevel, DifficultyBreakdown> = {
    Easy: emptyDifficulty("Easy"),
    Moderate: emptyDifficulty("Moderate"),
    Tough: emptyDifficulty("Tough"),
  };

  for (const q of evaluation.questions) {
    if (q.status === "notConsidered") continue;
    const level = classifyDifficulty(q, avgTime);
    difficultyMap.set(q.questionId, level);
    const bucket = difficultyBuckets[level]!;
    bucket.total += 1;
    bucket.maxMarks += q.maxMarks;
    bucket.score += q.marks;
    if (q.status === "correct") { bucket.attempted += 1; bucket.correct += 1; }
    else if (q.status === "incorrect") { bucket.attempted += 1; bucket.incorrect += 1; }
    else if (q.status === "partial") { bucket.attempted += 1; bucket.partial += 1; }
    else if (q.status === "notAnswered") { bucket.unattempted += 1; }
    else if (q.status === "bonus" || q.status === "dropped") { bucket.attempted += 1; bucket.correct += 1; }
  }

  // Attempt quality
  const qualityMap = new Map<string, AttemptQuality>();
  const qualityBuckets: Record<AttemptQuality, AttemptQualityBucket> = {
    perfect: emptyQualityBucket("perfect", "Perfect Attempt", "Correct & solved within benchmark time"),
    wasted: emptyQualityBucket("wasted", "Wasted Attempt", "Incorrect attempt solved in a rush"),
    overtime: emptyQualityBucket("overtime", "Overtime Attempt", "Spent more than benchmark time"),
    confused: emptyQualityBucket("confused", "Confused Attempt", "Unattempted despite significant time"),
  };

  for (const q of evaluation.questions) {
    const quality = classifyAttemptQuality(q, avgTime);
    if (!quality) continue;
    qualityMap.set(q.questionId, quality);
    const bucket = qualityBuckets[quality]!;
    bucket.count += 1;
    bucket.score += q.marks;
    bucket.timeSpent += q.timeSpent;
    bucket.questionIds.push(q.questionId);
    bucket.bySubject[q.canonicalSubject] = (bucket.bySubject[q.canonicalSubject] ?? 0) + 1;
  }

  for (const bucket of Object.values(qualityBuckets)) {
    bucket.avgTime = bucket.count ? Math.round(bucket.timeSpent / bucket.count) : 0;
  }

  const predictedPercentile = evaluation.scored ? predictPercentile(evaluation.percentage) : 0;

  return {
    difficulty: [difficultyBuckets.Easy!, difficultyBuckets.Moderate!, difficultyBuckets.Tough!],
    attemptQuality: [qualityBuckets.perfect!, qualityBuckets.wasted!, qualityBuckets.overtime!, qualityBuckets.confused!],
    timeBuckets: buildTimeBuckets(evaluation, attempt),
    subjectMovement: buildSubjectMovement(evaluation),
    questionJourney: buildQuestionJourney(evaluation),
    painfulQuestions: findPainfulQuestions(evaluation),
    timeQuality: buildTimeQuality(evaluation),
    performanceRows: buildPerformanceRows(evaluation),
    predictedPercentile,
    difficultyByQuestion: difficultyMap,
    attemptQualityByQuestion: qualityMap,
  };
}
