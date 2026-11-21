"use client";

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExamRoom } from "@/components/exam-room";
import { ReviewDashboard } from "@/components/review-dashboard";
import { createAttempt } from "@/lib/attempt";
import { OfflineRouterProvider, useOfflinePath, useRouter } from "./next-shim";
import { listAttempts, putAttempt } from "./storage-shim";
import { Providers, useStore } from "./store-shim";

function OfflineAppShell() {
  const path = useOfflinePath();
  const router = useRouter();
  const { ready, tests, attempts, putAttempt: saveAttempt } = useStore();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (!ready || bootstrapped || tests.length === 0) return;
    let cancelled = false;
    (async () => {
      const test = tests[0];
      const existing = await listAttempts();
      if (cancelled) return;
      const ongoing = existing.find((a) => a.status === "ongoing");
      const latestSubmitted = existing.find((a) => a.status === "submitted");

      if (path === "/" || (!path.startsWith("/exam/") && !path.startsWith("/analysis/"))) {
        if (ongoing) {
          router.replace(`/exam/${ongoing.id}`);
        } else if (latestSubmitted) {
          router.replace(`/analysis/${latestSubmitted.id}`);
        } else {
          const fresh = createAttempt(test, "original", true);
          await putAttempt(fresh);
          if (!cancelled) {
            router.replace(`/exam/${fresh.id}`);
          }
        }
      }
      if (!cancelled) setBootstrapped(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, bootstrapped, tests, path, router]);

  async function handleRetake() {
    if (tests.length === 0) return;
    const fresh = createAttempt(tests[0], "original", true);
    await saveAttempt(fresh);
    router.push(`/exam/${fresh.id}`);
  }

  const examMatch = path.match(/^\/exam\/([^/?#]+)/);
  const analysisMatch = path.match(/^\/analysis\/([^/?#]+)/);

  if (!ready || (!examMatch && !analysisMatch)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="font-display text-2xl">Loading offline paper...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {analysisMatch ? (
        <header className="sticky top-0 z-30 border-b-[3px] border-[var(--ink)] bg-[var(--card)]/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl">IJEE</span>
              <span className="border border-[var(--ink)] bg-[var(--paper)] px-2 py-0.5 text-xs font-semibold">
                OFFLINE CBT
              </span>
            </div>
            <div className="flex items-center gap-2">
              {attempts.some((a) => a.status === "ongoing") ? (
                <button
                  className="border-2 border-[var(--ink)] px-3 py-1.5 text-sm font-semibold"
                  onClick={() => {
                    const open = attempts.find((a) => a.status === "ongoing");
                    if (open) router.push(`/exam/${open.id}`);
                  }}
                >
                  Resume Ongoing
                </button>
              ) : null}
              <button
                className="bg-[var(--vermilion)] px-3 py-1.5 text-sm font-semibold text-white"
                onClick={() => void handleRetake()}
              >
                Retake Paper
              </button>
            </div>
          </div>
        </header>
      ) : null}

      <main>
        {examMatch ? <ExamRoom attemptId={examMatch[1]} /> : null}
        {analysisMatch ? <ReviewDashboard attemptId={analysisMatch[1]} /> : null}
      </main>
    </div>
  );
}

function mount() {
  const container = document.getElementById("root");
  if (!container) return;
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <OfflineRouterProvider initialPath="/">
        <Providers>
          <OfflineAppShell />
        </Providers>
      </OfflineRouterProvider>
    </React.StrictMode>
  );
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
}
