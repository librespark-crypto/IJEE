import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Attempt, ChatThread, Settings, StoredTest, TopicProgress } from "./types";

type ImageRecord = { id: string; testId: string; blob: Blob };
type SettingsRecord = Settings & { id: "app" };

interface FjeeSchema extends DBSchema {
  tests: { key: string; value: StoredTest };
  images: { key: string; value: ImageRecord; indexes: { "by-test": string } };
  attempts: { key: string; value: Attempt; indexes: { "by-test": string } };
  progress: { key: string; value: TopicProgress };
  settings: { key: string; value: SettingsRecord };
  chats: { key: string; value: ChatThread };
}

const DB_NAME = "fjee";
const DB_VERSION = 1;

export const defaultSettings: Settings = {
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  numbering: "cumulative",
  realExamSave: false,
  defaultMainSeconds: 10800,
  defaultAdvancedSeconds: 10800,
};

let database: Promise<IDBPDatabase<FjeeSchema>> | null = null;

function db() {
  if (!database) {
    database = openDB<FjeeSchema>(DB_NAME, DB_VERSION, {
      upgrade(store) {
        store.createObjectStore("tests", { keyPath: "id" });
        const images = store.createObjectStore("images", { keyPath: "id" });
        images.createIndex("by-test", "testId");
        const attempts = store.createObjectStore("attempts", { keyPath: "id" });
        attempts.createIndex("by-test", "testId");
        store.createObjectStore("progress", { keyPath: "topicId" });
        store.createObjectStore("settings", { keyPath: "id" });
        store.createObjectStore("chats", { keyPath: "id" });
      },
    });
  }
  return database;
}

export async function listTests() {
  return (await db()).getAll("tests");
}

export async function getTest(id: string) {
  return (await db()).get("tests", id);
}

export async function saveTest(test: StoredTest, images: { id: string; blob: Blob }[] = []) {
  const database = await db();
  const tx = database.transaction(["tests", "images"], "readwrite");
  await tx.objectStore("tests").put(test);
  for (const image of images) {
    await tx.objectStore("images").put({ id: image.id, testId: test.id, blob: image.blob });
  }
  await tx.done;
}

export async function deleteTest(id: string) {
  const database = await db();
  const tx = database.transaction(["tests", "images", "attempts"], "readwrite");
  await tx.objectStore("tests").delete(id);
  const images = await tx.objectStore("images").index("by-test").getAllKeys(id);
  for (const key of images) await tx.objectStore("images").delete(key);
  const attempts = await tx.objectStore("attempts").index("by-test").getAllKeys(id);
  for (const key of attempts) await tx.objectStore("attempts").delete(key);
  await tx.done;
}

export async function getImages(ids: string[]) {
  const database = await db();
  const map = new Map<string, Blob>();
  for (const id of ids) {
    const row = await database.get("images", id);
    if (row) map.set(id, row.blob);
  }
  return map;
}

export async function listAttempts() {
  return (await db()).getAll("attempts");
}

export async function getAttempt(id: string) {
  return (await db()).get("attempts", id);
}

export async function saveAttempt(attempt: Attempt) {
  await (await db()).put("attempts", attempt);
}

export async function deleteAttempt(id: string) {
  await (await db()).delete("attempts", id);
}

export async function listProgress() {
  return (await db()).getAll("progress");
}

export async function saveProgress(progress: TopicProgress) {
  await (await db()).put("progress", progress);
}

export async function getSettings(): Promise<Settings> {
  const row = await (await db()).get("settings", "app");
  return row ? { ...defaultSettings, ...row } : defaultSettings;
}

export async function saveSettings(settings: Settings) {
  await (await db()).put("settings", { ...settings, id: "app" });
}

export async function listChats() {
  return (await db()).getAll("chats");
}

export async function saveChat(chat: ChatThread) {
  await (await db()).put("chats", chat);
}

export async function deleteChat(id: string) {
  await (await db()).delete("chats", id);
}

export async function exportBackup() {
  const database = await db();
  const [tests, images, attempts, progress, settings, chats] = await Promise.all([
    database.getAll("tests"),
    database.getAll("images"),
    database.getAll("attempts"),
    database.getAll("progress"),
    database.getAll("settings"),
    database.getAll("chats"),
  ]);
  const imagePayload = await Promise.all(
    images.map(async (image) => ({
      id: image.id,
      testId: image.testId,
      type: image.blob.type || "image/png",
      data: await image.blob.arrayBuffer(),
    })),
  );
  return { version: 1, exportedAt: Date.now(), tests, attempts, progress, settings, chats, images: imagePayload };
}

export async function importBackup(payload: {
  tests?: StoredTest[];
  attempts?: Attempt[];
  progress?: TopicProgress[];
  settings?: SettingsRecord[];
  chats?: ChatThread[];
  images?: { id: string; testId: string; type?: string; data: ArrayBuffer }[];
}) {
  const database = await db();
  const tx = database.transaction(["tests", "images", "attempts", "progress", "settings", "chats"], "readwrite");
  for (const test of payload.tests ?? []) await tx.objectStore("tests").put(test);
  for (const attempt of payload.attempts ?? []) await tx.objectStore("attempts").put(attempt);
  for (const item of payload.progress ?? []) await tx.objectStore("progress").put(item);
  for (const item of payload.settings ?? []) await tx.objectStore("settings").put(item);
  for (const chat of payload.chats ?? []) await tx.objectStore("chats").put(chat);
  for (const image of payload.images ?? []) {
    await tx.objectStore("images").put({
      id: image.id,
      testId: image.testId,
      blob: new Blob([image.data], { type: image.type || "image/png" }),
    });
  }
  await tx.done;
}

export async function clearAllLocalData() {
  const database = await db();
  const tx = database.transaction(["tests", "images", "attempts", "progress", "settings", "chats"], "readwrite");
  await Promise.all([
    tx.objectStore("tests").clear(),
    tx.objectStore("images").clear(),
    tx.objectStore("attempts").clear(),
    tx.objectStore("progress").clear(),
    tx.objectStore("settings").clear(),
    tx.objectStore("chats").clear(),
  ]);
  await tx.done;
}
