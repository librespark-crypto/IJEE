"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Attempt, Settings, StoredTest } from "@/lib/types";
import { getSettings, listAttempts, listTests, putAttempt as saveAttempt } from "./storage-shim";

type StoreValue = {
  ready: boolean;
  tests: StoredTest[];
  attempts: Attempt[];
  settings: Settings;
  refresh: () => Promise<void>;
  putAttempt: (attempt: Attempt) => Promise<void>;
  putTest: () => Promise<void>;
  removeTest: () => Promise<void>;
  saveSettings: () => Promise<void>;
};

const defaultSettings: Settings = {
  numbering: "original",
  realExamSave: true,
  geminiModel: "",
  defaultMainSeconds: 10800,
  defaultAdvancedSeconds: 10800,
};

const StoreContext = createContext<StoreValue>({
  ready: false,
  tests: [],
  attempts: [],
  settings: defaultSettings,
  refresh: async () => {},
  putAttempt: async () => {},
  putTest: async () => {},
  removeTest: async () => {},
  saveSettings: async () => {},
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [tests, setTests] = useState<StoredTest[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  const refresh = useCallback(async () => {
    const [t, a, s] = await Promise.all([listTests(), listAttempts(), getSettings()]);
    setTests(t);
    setAttempts(a);
    setSettings(s);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const putAttempt = useCallback(async (attempt: Attempt) => {
    await saveAttempt(attempt);
    setAttempts((prev) => {
      const idx = prev.findIndex((item) => item.id === attempt.id);
      if (idx === -1) return [attempt, ...prev];
      const next = [...prev];
      next[idx] = attempt;
      return next;
    });
  }, []);

  return (
    <StoreContext.Provider
      value={{
        ready,
        tests,
        attempts,
        settings,
        refresh,
        putAttempt,
        putTest: async () => {},
        removeTest: async () => {},
        saveSettings: async () => {},
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
