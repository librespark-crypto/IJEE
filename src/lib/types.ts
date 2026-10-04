export type ExamType = "jee-main" | "jee-advanced" | "custom";
export type TestKind = "full" | "part" | "practice";
export type QuestionType = "mcq" | "msq" | "nat" | "msm";
export type QuestionStatus =
  | "notVisited"
  | "notAnswered"
  | "answered"
  | "marked"
  | "markedAnswered";
export type ResultStatus =
  | "correct"
  | "incorrect"
  | "partial"
  | "notAnswered"
  | "bonus"
  | "dropped"
  | "notConsidered";
export type NumberingMode = "original" | "cumulative" | "section-wise";

export type QuestionMarks = {
  cm: number;
  im: number;
  pm?: number;
  max?: number;
};

export type UserAnswer =
  | { kind: "mcq"; option: number }
  | { kind: "msq"; options: number[] }
  | { kind: "nat"; value: string }
  | { kind: "msm"; rows: Record<string, number[]> };

/** Official key, already unwrapped from PDF2CBT's old and new answer-key shapes. */
export type OfficialAnswer =
  | { kind: "choice"; values: number[] }
  | { kind: "nat"; raw: string }
  | { kind: "msm"; rows: Record<string, number[]> }
  | { kind: "bonus" }
  | { kind: "dropped" }
  | { kind: "missing" };

export type Question = {
  id: string;
  subject: string;
  canonicalSubject: string;
  section: string;
  number: number;
  type: QuestionType;
  marks: QuestionMarks;
  optionCount: number;
  msmRows: number;
  msmCols: number;
  counterPrimary?: string;
  counterSecondary?: string;
  answer: OfficialAnswer;
  hasAnswerKey: boolean;
  imageIds: string[];
  solution?: string;
  topic?: string;
  concept?: string;
};

export type TestSection = {
  subject: string;
  name: string;
  optionalQuestions: number;
  instructionType?: string;
  questionIds: string[];
};

export type ValidationItem = {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type StoredTest = {
  id: string;
  name: string;
  examType: ExamType;
  kind: TestKind;
  durationSeconds: number;
  createdAt: number;
  sourceFile: string;
  appVersion?: string;
  generatedBy?: string;
  subjects: string[];
  sections: TestSection[];
  questions: Question[];
  validation: ValidationItem[];
};

export type AttemptResponse = {
  questionId: string;
  /** Committed response. Scoring reads only this. */
  answer: UserAnswer | null;
  /** Uncommitted selection when real-exam save is on. */
  pending: UserAnswer | null;
  status: QuestionStatus;
  timeSpent: number;
};

export type QuestionResult = {
  questionId: string;
  status: ResultStatus;
  marks: number;
  maxMarks: number;
  accuracyNumerator: number;
  missingKey: boolean;
};

export type QuestionAnalysis = QuestionResult & {
  displayNumber: number;
  number: number;
  subject: string;
  canonicalSubject: string;
  section: string;
  type: QuestionType;
  userLabel: string;
  correctLabel: string;
  timeSpent: number;
  marked: boolean;
  solution?: string;
  topic?: string;
  concept?: string;
  imageIds: string[];
};

export type BucketStats = {
  name: string;
  score: number;
  maxMarks: number;
  percentage: number;
  accuracy: number;
  attemptRate: number;
  correct: number;
  incorrect: number;
  partial: number;
  unattempted: number;
  dropped: number;
  bonus: number;
  notConsidered: number;
  attempted: number;
  considered: number;
  timeSpent: number;
  avgTime: number;
  negativeMarks: number;
};

export type Insight = {
  id: string;
  tone: "strong" | "weak" | "time" | "guess" | "concept" | "calc" | "skip" | "note";
  title: string;
  detail: string;
  questionIds: string[];
};

export type Evaluation = {
  scored: boolean;
  score: number;
  maxMarks: number;
  percentage: number;
  accuracy: number;
  attemptRate: number;
  correct: number;
  incorrect: number;
  partial: number;
  unattempted: number;
  dropped: number;
  bonus: number;
  notConsidered: number;
  attempted: number;
  considered: number;
  negativeMarks: number;
  totalTime: number;
  avgTime: number;
  missingKeyCount: number;
  subjects: BucketStats[];
  sections: BucketStats[];
  types: BucketStats[];
  questions: QuestionAnalysis[];
  insights: Insight[];
  slowQuestionIds: string[];
  fastGuessIds: string[];
};

export type Attempt = {
  id: string;
  testId: string;
  testName: string;
  examType: ExamType;
  kind: TestKind;
  status: "ongoing" | "submitted";
  startedAt: number;
  updatedAt: number;
  submittedAt?: number;
  durationSeconds: number;
  remainingSeconds: number;
  currentQuestionId: string;
  questionOpenedAt: number;
  numbering: NumberingMode;
  realExamSave: boolean;
  displayNumbers: Record<string, number>;
  responses: Record<string, AttemptResponse>;
  evaluation?: Evaluation;
  explanations?: Record<string, string>;
  autoSubmitted?: boolean;
};

export type Settings = {
  geminiModel: string;
  numbering: NumberingMode;
  realExamSave: boolean;
  defaultMainSeconds: number;
  defaultAdvancedSeconds: number;
};

export type TopicStatus =
  | "not_started"
  | "learning"
  | "completed"
  | "revision"
  | "strong";

export type SyllabusTopic = {
  id: string;
  subject: "Physics" | "Chemistry" | "Mathematics";
  unit: string;
  chapter: string;
  topic: string;
  subtopics: string[];
  exams: ("JM" | "JA")[];
  classLevel: 11 | 12;
};

export type TopicProgress = {
  topicId: string;
  status: TopicStatus;
  lecturesCompleted: number;
  questionsSolved: number;
  revisionCount: number;
  lastRevision: number | null;
  notes: string;
  testAccuracy: number | null;
  updatedAt: number;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  at: number;
};

export type ChatThread = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
};

export type CropJob = {
  imageId: string;
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
};

export type ImportDraft = {
  kind: "test";
  test: StoredTest;
  images: { id: string; blob: Blob }[];
  cropJobs: CropJob[];
  pdfBytes: Uint8Array | null;
  report: ValidationItem[];
  blocking: string[];
};

export type AnswerKeyDraft = {
  kind: "answer-key";
  report: ValidationItem[];
  answers: Record<string, OfficialAnswer>;
  keyed: number;
  sourceName: string;
};
