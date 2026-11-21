import type { Attempt, Settings, StoredTest } from "@/lib/types";

export interface OfflinePayload {
  test: StoredTest;
  images: Record<string, string>;
}

declare global {
  interface Window {
    __IJEE_OFFLINE_DATA__?: OfflinePayload;
  }
}

function getPayload(): OfflinePayload {
  if (typeof window === "undefined" || !window.__IJEE_OFFLINE_DATA__) {
    throw new Error("Offline test data is missing.");
  }
  return window.__IJEE_OFFLINE_DATA__;
}

function attemptStorageKey(testId: string): string {
  return `ijee-offline-attempts:${testId}`;
}

function readAttemptsMap(testId: string): Record<string, Attempt> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(attemptStorageKey(testId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Attempt>;
  } catch {
    return {};
  }
}

function writeAttemptsMap(testId: string, map: Record<string, Attempt>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(attemptStorageKey(testId), JSON.stringify(map));
  } catch {
    // Ignore quota errors in restricted environments
  }
}

export async function getTest(id: string): Promise<StoredTest | undefined> {
  const { test } = getPayload();
  return test.id === id ? test : test;
}

export async function listTests(): Promise<StoredTest[]> {
  return [getPayload().test];
}

export async function getImages(ids: string[]): Promise<Record<string, string>> {
  const { images } = getPayload();
  const out: Record<string, string> = {};
  for (const id of ids) {
    if (images[id]) {
      out[id] = images[id];
    }
  }
  return out;
}

export async function getAttempt(id: string): Promise<Attempt | undefined> {
  const { test } = getPayload();
  const map = readAttemptsMap(test.id);
  return map[id];
}

export async function listAttempts(): Promise<Attempt[]> {
  const { test } = getPayload();
  const map = readAttemptsMap(test.id);
  return Object.values(map).sort((a, b) => b.startedAt - a.startedAt);
}

export async function putAttempt(attempt: Attempt): Promise<void> {
  const { test } = getPayload();
  const map = readAttemptsMap(test.id);
  map[attempt.id] = attempt;
  writeAttemptsMap(test.id, map);
}

export async function getSettings(): Promise<Settings> {
  return {
    numbering: "original",
    realExamSave: true,
    geminiModel: "",
    defaultMainSeconds: 10800,
    defaultAdvancedSeconds: 10800,
  };
}
