"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Attempt, ChatThread, Settings, StoredTest, TopicProgress } from "@/lib/types";
import { buildEvaluation } from "@/lib/evaluate";
import {
  clearAllLocalData,
  defaultSettings,
  deleteAttempt,
  deleteChat,
  deleteTest,
  getSettings,
  getTest,
  listAttempts,
  listChats,
  listProgress,
  listTests,
  saveAttempt,
  saveChat,
  saveProgress,
  saveSettings,
  saveTest,
} from "@/lib/storage";

type Store = {
  ready: boolean;
  tests: StoredTest[];
  attempts: Attempt[];
  progress: TopicProgress[];
  chats: ChatThread[];
  settings: Settings;
  refresh: () => Promise<void>;
  getPaper: (id: string) => Promise<StoredTest | undefined>;
  putTest: typeof saveTest;
  removeTest: (id: string) => Promise<void>;
  putAttempt: (attempt: Attempt) => Promise<void>;
  removeAttempt: (id: string) => Promise<void>;
  putProgress: (item: TopicProgress) => Promise<void>;
  putSettings: (settings: Settings) => Promise<void>;
  putChat: (chat: ChatThread) => Promise<void>;
  removeChat: (id: string) => Promise<void>;
  wipe: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [tests, setTests] = useState<StoredTest[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [progress, setProgress] = useState<TopicProgress[]>([]);
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  async function refresh() {
    const [nextTests, storedAttempts, nextProgress, nextChats, nextSettings] = await Promise.all([
      listTests(),
      listAttempts(),
      listProgress(),
      listChats(),
      getSettings(),
    ]);
    const testsById = new Map(nextTests.map((test) => [test.id, test]));
    const attemptsToSave: Attempt[] = [];
    const nextAttempts = storedAttempts.map((attempt) => {
      const test = testsById.get(attempt.testId);
      if (!test || attempt.status !== "submitted") return attempt;
      const evaluation = buildEvaluation(test, attempt);
      if (JSON.stringify(attempt.evaluation) !== JSON.stringify(evaluation)) {
        const updated = { ...attempt, evaluation };
        attemptsToSave.push(updated);
        return updated;
      }
      return attempt;
    });
    if (attemptsToSave.length) await Promise.all(attemptsToSave.map(saveAttempt));
    setTests(nextTests.sort((a, b) => b.createdAt - a.createdAt));
    setAttempts(nextAttempts.sort((a, b) => b.updatedAt - a.updatedAt));
    setProgress(nextProgress);
    setChats(nextChats.sort((a, b) => b.updatedAt - a.updatedAt));
    setSettings(nextSettings);
    setReady(true);
  }

  const putAttempt = useCallback(async (attempt: Attempt) => {
    await saveAttempt(attempt);
    setAttempts((current) => [attempt, ...current.filter((item) => item.id !== attempt.id)].sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);

  useEffect(() => {
    setTimeout(() => { void refresh(); }, 0);
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready,
      tests,
      attempts,
      progress,
      chats,
      settings,
      refresh,
      getPaper: getTest,
      putTest: async (test, images) => {
        await saveTest(test, images);
        await refresh();
      },
      removeTest: async (id) => {
        await deleteTest(id);
        await refresh();
      },
      putAttempt,
      removeAttempt: async (id) => {
        await deleteAttempt(id);
        await refresh();
      },
      putProgress: async (item) => {
        await saveProgress(item);
        setProgress((current) => [item, ...current.filter((row) => row.topicId !== item.topicId)]);
      },
      putSettings: async (next) => {
        await saveSettings(next);
        setSettings(next);
      },
      putChat: async (chat) => {
        await saveChat(chat);
        setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)].sort((a, b) => b.updatedAt - a.updatedAt));
      },
      removeChat: async (id) => {
        await deleteChat(id);
        setChats((current) => current.filter((item) => item.id !== id));
      },
      wipe: async () => {
        await clearAllLocalData();
        await refresh();
      },
    }),
    [ready, tests, attempts, progress, chats, settings, putAttempt],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Store missing");
  return value;
}
