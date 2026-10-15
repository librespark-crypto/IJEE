"use client";

// Hybrid AI question solver — "Solve with AI".
//
// Mode A (built-in IJEE AI): the complete question context, including every
// original-resolution image, goes through the authenticated /api/ai/solve
// backend. Credentials stay on the server.
//
// Mode B (external handoff): Google Search, Gemini, ChatGPT, Claude. Text is
// prefilled only where the destination officially supports it; images are
// never claimed to have been transferred — the sheet gives an explicit
// copy / save / share / attach workflow instead.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  ImageOff,
  Loader2,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { RichText } from "@/components/latex";
import { useStore } from "@/components/store";
import { ChatGptIcon, ClaudeIcon, GeminiIcon, GoogleGIcon } from "@/components/provider-icons";
import { cx } from "@/lib/format";
import {
  assembleQuestionContext,
  buildChatGptUrl,
  buildClaudeUrl,
  buildExternalJeePrompt,
  buildGeminiUrl,
  buildGoogleSearchQuery,
  buildGoogleSearchUrl,
  buildJeeUserPrompt,
  buildQuestionTextOnly,
  type QuestionContext,
  type QuestionImageAsset,
} from "@/lib/jee-solver";
import { captureQuestionContext, type CapturedContext } from "@/lib/question-context";
import type { Question, StoredTest } from "@/lib/types";

type ProviderId = "ijee" | "google" | "gemini" | "chatgpt" | "claude";
type SheetView = "providers" | ProviderId;
type Phase = "loading" | "ready" | "error";
type AiTurn = { role: "user" | "assistant"; content: string };

export type SolveWithAIButtonProps = {
  test: StoredTest;
  /** The currently selected question. Snapshotted when the sheet opens. */
  question: Question;
  displayNumber?: number | null;
  /** Object URLs the page already created for this test's images. */
  urls?: Record<string, string>;
  /** Review/verify workflow only: the student's committed answer label. */
  userAnswerLabel?: string | null;
  /** Allow the answer-verification toggle (review mode). Never in the exam room. */
  allowAnswerKey?: boolean;
  sectionInstruction?: string | null;
  /** "manga" for the paper-themed pages, "cbt" for the exam room. */
  variant?: "manga" | "cbt";
  label?: string;
  className?: string;
};

export function SolveWithAIButton(props: SolveWithAIButtonProps) {
  const { variant = "manga", label = "Solve with AI", className } = props;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cx(
          "solve-trigger inline-flex items-center gap-1.5",
          variant === "cbt"
            ? "border border-[#0f3d73] bg-white px-2.5 py-1 text-sm font-semibold text-[#0f3d73] hover:bg-blue-50"
            : "manga-btn px-3 py-2",
          className,
        )}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Sparkles aria-hidden="true" size={16} />
        {label}
      </button>
      {open ? (
        <SolveSheet {...props} onClose={() => setOpen(false)} triggerRef={triggerRef} />
      ) : null}
    </>
  );
}

type Snapshot = {
  test: StoredTest;
  question: Question;
  displayNumber: number | null;
  urls: Record<string, string>;
  userAnswerLabel: string | null;
  sectionInstruction: string | null;
  allowAnswerKey: boolean;
};

function SolveSheet({
  test,
  question,
  displayNumber,
  urls,
  userAnswerLabel,
  allowAnswerKey,
  sectionInstruction,
  onClose,
  triggerRef,
}: SolveWithAIButtonProps & {
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { settings } = useStore();
  // The sheet mounts fresh on every open, so the props at mount time ARE the
  // open-time snapshot. Navigating to another question later never mutates
  // what this sheet is solving.
  const [snapshot] = useState<Snapshot>(() => ({
    test,
    question,
    displayNumber: displayNumber ?? question.number ?? null,
    urls: urls ?? {},
    userAnswerLabel: userAnswerLabel ?? null,
    sectionInstruction: sectionInstruction ?? null,
    allowAnswerKey: Boolean(allowAnswerKey),
  }));
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState("");
  const [captured, setCaptured] = useState<CapturedContext | null>(null);
  const [view, setView] = useState<SheetView>("providers");
  const [verifyKey, setVerifyKey] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");
  const [popupBlocked, setPopupBlocked] = useState<{ provider: string; url: string } | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; dy: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    void (async () => {
      try {
        const result = await captureQuestionContext({
          test: snapshot.test,
          question: snapshot.question,
          ...(snapshot.displayNumber != null ? { displayNumber: snapshot.displayNumber } : {}),
          existingUrls: snapshot.urls,
          ...(snapshot.userAnswerLabel != null ? { userAnswerLabel: snapshot.userAnswerLabel } : {}),
          ...(snapshot.sectionInstruction ? { sectionInstruction: snapshot.sectionInstruction } : {}),
        });
        if (cancelled) {
          for (const url of result.createdUrls) URL.revokeObjectURL(url);
          return;
        }
        created.push(...result.createdUrls);
        setCaptured(result);
        setPhase("ready");
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not capture this question.");
          setPhase("error");
        }
      }
    })();

    void (async () => {
      try {
        const response = await fetch("/api/ai/solve");
        const payload = (await response.json().catch(() => null)) as { configured?: boolean } | null;
        if (!cancelled) setAiConfigured(Boolean(payload?.configured));
      } catch {
        if (!cancelled) setAiConfigured(false);
      }
    })();

    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [snapshot]);

  // Focus, Escape, scroll lock, and focus restore.
  useEffect(() => {
    const sheet = sheetRef.current;
    sheet?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement as HTMLElement | null;
    const trigger = triggerRef.current;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusables = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus && previousFocus !== trigger) previousFocus.focus?.();
      trigger?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per open
  }, []);

  // Swipe-down-to-dismiss on the grab handle.
  useEffect(() => {
    const grab = grabRef.current;
    const sheet = sheetRef.current;
    if (!grab || !sheet) return;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      dragRef.current = { startY: touch.clientY, dy: 0 };
    };
    const onMove = (event: TouchEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // The desktop dialog is centered with a transform; only the mobile
      // bottom sheet supports swipe-to-dismiss.
      if (window.innerWidth >= 768) return;
      const touch = event.touches[0];
      drag.dy = Math.max(0, touch.clientY - drag.startY);
      sheet.style.transform = `translateY(${drag.dy}px)`;
    };
    const onEnd = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      sheet.style.transform = "";
      if (drag && drag.dy > 96) onClose();
    };
    grab.addEventListener("touchstart", onStart, { passive: true });
    grab.addEventListener("touchmove", onMove, { passive: true });
    grab.addEventListener("touchend", onEnd);
    return () => {
      grab.removeEventListener("touchstart", onStart);
      grab.removeEventListener("touchmove", onMove);
      grab.removeEventListener("touchend", onEnd);
    };
  }, [onClose]);

  // The effective context: pure re-assembly when the verification toggle flips.
  const context = useMemo<QuestionContext | null>(() => {
    if (!captured) return null;
    if (!verifyKey) return captured.context;
    return assembleQuestionContext({
      test: snapshot.test,
      question: snapshot.question,
      ...(snapshot.displayNumber != null ? { displayNumber: snapshot.displayNumber } : {}),
      images: captured.context.imageAssets,
      includeAnswerKey: true,
      ...(snapshot.userAnswerLabel != null ? { userAnswerLabel: snapshot.userAnswerLabel } : {}),
      ...(snapshot.sectionInstruction ? { sectionInstruction: snapshot.sectionInstruction } : {}),
    });
  }, [captured, snapshot, verifyKey]);

  const headerLabel = snapshot
    ? `Question ${snapshot.displayNumber ?? "?"} · ${snapshot.question.canonicalSubject || snapshot.question.subject}`
    : "Capturing question…";

  async function copyText(text: string, label: string) {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        ok = document.execCommand("copy");
        document.body.removeChild(helper);
      } catch {
        ok = false;
      }
    }
    setNotice(ok ? `${label} copied. Paste it into the assistant.` : "Copy is unavailable in this browser.");
    return ok;
  }

  const openProviderWindow = useCallback((provider: string, url: string) => {
    setPopupBlocked(null);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) setPopupBlocked({ provider, url });
  }, []);

  return (
    <div className="solve-surface">
      <div className="solve-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="solve-sheet-title"
        aria-describedby="solve-sheet-subtitle"
        tabIndex={-1}
        className="solve-sheet"
      >
        <div ref={grabRef} className="solve-grab" aria-hidden="true">
          <span className="solve-handle" />
        </div>
        <header className="solve-header">
          {view !== "providers" ? (
            <button type="button" className="solve-chip" onClick={() => { setView("providers"); setPopupBlocked(null); }} aria-label="Back to provider list">
              <ArrowLeft aria-hidden="true" size={16} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id="solve-sheet-title" className="solve-title">
              {view === "providers" ? "Solve with AI" : PROVIDER_META[view].name}
            </h2>
            <p id="solve-sheet-subtitle" className="solve-subtitle">
              {headerLabel}
              {verifyKey ? " · verification mode" : ""}
            </p>
          </div>
          <button type="button" className="solve-chip" onClick={onClose} aria-label="Close Solve with AI">
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <div className="solve-body">
          {phase === "loading" ? (
            <div className="solve-status" role="status" aria-live="polite">
              <Loader2 aria-hidden="true" size={20} className="solve-spin" />
              <p>Capturing the complete question with all images…</p>
            </div>
          ) : phase === "error" ? (
            <div className="solve-notice solve-notice--warn" role="alert">
              <AlertTriangle aria-hidden="true" size={16} />
              <p>{loadError}</p>
              <button
                type="button"
                className="solve-chip solve-chip--action"
                onClick={() => {
                  setPhase("loading");
                  void (async () => {
                    try {
                      // Retry always re-captures the SAME question this sheet
                      // was opened for, even if the user navigated meanwhile.
                      const result = await captureQuestionContext({
                        test: snapshot.test,
                        question: snapshot.question,
                        ...(snapshot.displayNumber != null ? { displayNumber: snapshot.displayNumber } : {}),
                        existingUrls: snapshot.urls,
                        ...(snapshot.userAnswerLabel != null ? { userAnswerLabel: snapshot.userAnswerLabel } : {}),
                        ...(snapshot.sectionInstruction ? { sectionInstruction: snapshot.sectionInstruction } : {}),
                      });
                      setCaptured(result);
                      setPhase("ready");
                    } catch (error) {
                      setLoadError(error instanceof Error ? error.message : "Could not capture this question.");
                      setPhase("error");
                    }
                  })();
                }}
              >
                <RefreshCw aria-hidden="true" size={14} /> Retry
              </button>
            </div>
          ) : context && captured ? (
            view === "providers" ? (
              <ProviderList
                context={context}
                aiConfigured={aiConfigured}
                allowAnswerKey={snapshot.allowAnswerKey}
                verifyKey={verifyKey}
                onVerifyKeyChange={setVerifyKey}
                onSelect={(provider) => { setPopupBlocked(null); setView(provider); }}
              />
            ) : view === "ijee" ? (
              <IjeeAiPanel
                context={context}
                sendableImages={captured.sendableImages}
                omissions={captured.omissions}
                model={settings.geminiModel}
                configured={aiConfigured}
                onNotice={setNotice}
              />
            ) : (
              <ExternalProviderPanel
                provider={view}
                context={context}
                onCopy={copyText}
                onOpen={openProviderWindow}
                popupBlocked={popupBlocked}
                onDismissBlocked={() => setPopupBlocked(null)}
                onViewImage={(url, label) => setLightbox({ url, label })}
                onNotice={setNotice}
              />
            )
          ) : null}
        </div>
      </div>

      {notice ? (
        <p className="solve-live-status" role="status" aria-live="polite">{notice}</p>
      ) : null}

      {lightbox ? (
        <div className="solve-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.label}>
          <button type="button" className="solve-lightbox-close solve-chip" onClick={() => setLightbox(null)} aria-label="Close image">
            <X aria-hidden="true" size={16} />
          </button>
          <img src={lightbox.url} alt={lightbox.label} />
        </div>
      ) : null}
    </div>
  );
}

const PROVIDER_META: Record<ProviderId, { name: string; description: string }> = {
  ijee: { name: "IJEE AI", description: "Solve inside IJEE — every question image goes directly to the model" },
  google: { name: "Google Search", description: "Search the question text on Google" },
  gemini: { name: "Gemini", description: "Google Gemini — copy the JEE prompt, then paste and attach" },
  chatgpt: { name: "ChatGPT", description: "ChatGPT — opens with the JEE prompt prefilled" },
  claude: { name: "Claude", description: "Claude — opens with the JEE prompt prefilled" },
};

function ProviderIcon({ provider }: { provider: ProviderId }) {
  if (provider === "google") return <GoogleGIcon size={24} />;
  if (provider === "gemini") return <GeminiIcon size={24} />;
  if (provider === "chatgpt") return <ChatGptIcon size={24} />;
  if (provider === "claude") return <ClaudeIcon size={24} />;
  return <Sparkles aria-hidden="true" size={24} />;
}

function ProviderList({
  context,
  aiConfigured,
  allowAnswerKey,
  verifyKey,
  onVerifyKeyChange,
  onSelect,
}: {
  context: QuestionContext;
  aiConfigured: boolean | null;
  allowAnswerKey: boolean;
  verifyKey: boolean;
  onVerifyKeyChange: (value: boolean) => void;
  onSelect: (provider: ProviderId) => void;
}) {
  const providers: ProviderId[] = ["ijee", "google", "gemini", "chatgpt", "claude"];
  const imageCount = context.imageAssets.length;
  return (
    <div className="solve-providers">
      {providers.map((provider) => {
        const disabled = provider === "ijee" && aiConfigured === false;
        return (
          <button
            key={provider}
            type="button"
            className="solve-provider-row"
            disabled={disabled}
            aria-label={`${PROVIDER_META[provider].name} — ${PROVIDER_META[provider].description}`}
            onClick={() => onSelect(provider)}
          >
            <span className={cx("solve-tile", `solve-tile--${provider}`)}>
              <ProviderIcon provider={provider} />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="solve-provider-name">{PROVIDER_META[provider].name}</span>
              <span className="solve-provider-desc">
                {provider === "ijee" && aiConfigured === false
                  ? "Not configured on this deployment (missing GEMINI_API_KEY) — use an external option below"
                  : PROVIDER_META[provider].description}
              </span>
            </span>
            {provider === "ijee" && aiConfigured === null ? (
              <Loader2 aria-hidden="true" size={16} className="solve-spin shrink-0" />
            ) : null}
          </button>
        );
      })}

      {allowAnswerKey && context.hasAnswerKey ? (
        <label className="solve-verify-toggle">
          <input
            type="checkbox"
            checked={verifyKey}
            onChange={(event) => onVerifyKeyChange(event.target.checked)}
          />
          <span>
            <strong>Verify against the official answer key.</strong>
            Adds the key, your answer, and the imported solution to the prompt. Keep it off for an independent solve.
          </span>
        </label>
      ) : null}

      <p className="solve-footnote">
        {imageCount > 0
          ? `${imageCount} original image${imageCount === 1 ? "" : "s"} captured at full resolution. External sites receive text only — attach the images yourself where needed.`
          : "This question has no images. External sites receive the question text."}
        {allowAnswerKey && !verifyKey ? " The official answer key is never sent unless you enable verification." : ""}
      </p>
    </div>
  );
}

function IjeeAiPanel({
  context,
  sendableImages,
  omissions,
  model,
  configured,
  onNotice,
}: {
  context: QuestionContext;
  sendableImages: { mimeType: string; data: string }[];
  omissions: string[];
  model: string;
  configured: boolean | null;
  onNotice: (message: string) => void;
}) {
  const [status, setStatus] = useState<"loading" | "error" | "done" | "blocked">(() =>
    configured === false || (context.imageAssets.length > 0 && sendableImages.length === 0) ? "blocked" : "loading",
  );
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState(false);
  const lastRequest = useRef<null | { prompt: string }>(null);
  const allImagesMissing = context.imageAssets.length > 0 && sendableImages.length === 0;

  const solve = useCallback(
    async (prompt: string) => {
      lastRequest.current = { prompt };
      setError("");
      try {
        const response = await fetch("/api/ai/solve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: context.questionId,
            prompt,
            images: sendableImages,
            history: turns.slice(-6),
            model,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { text?: string; error?: string; model?: string }
          | null;
        if (!response.ok || !payload?.text) {
          throw new Error(payload?.error || "The solver could not answer this question.");
        }
        setTurns((current) => [...current, { role: "assistant", content: payload.text! }]);
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "The solver request failed.");
        setStatus("error");
      }
    },
    [context.questionId, sendableImages, turns, model],
  );

  useEffect(() => {
    if (status !== "loading") return; // auto-start only when there is something to solve
    // Deferred a tick so the sheet paints its loading state first and the
    // effect body stays free of synchronous state updates.
    const timer = window.setTimeout(() => void solve(buildJeeUserPrompt(context)), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solve once on entry
  }, []);

  async function sendFollowUp() {
    const text = followUp.trim();
    if (!text || busy) return;
    setBusy(true);
    onNotice("");
    try {
      setTurns((current) => [...current, { role: "user", content: text }]);
      setFollowUp("");
      await solve(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="solve-ijee">
      <p className="solve-ijee-meta">
        Built-in IJEE AI · {model || "default model"} · {sendableImages.length} image
        {sendableImages.length === 1 ? "" : "s"} sent
        {context.imageAssets.length > sendableImages.length
          ? ` of ${context.imageAssets.length}`
          : ""}
      </p>

      {allImagesMissing ? (
        <div className="solve-notice solve-notice--warn" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          <p>
            None of the {context.imageAssets.length} images for this question could be loaded from this browser, so
            there is nothing to solve yet. Reload the paper or use an external option and attach the image manually.
          </p>
          <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="solve-chip solve-chip--action"
                onClick={() => { setStatus("loading"); void solve(buildJeeUserPrompt(context)); }}
              >
                <RefreshCw aria-hidden="true" size={14} /> Solve with text details only
              </button>
          </div>
        </div>
      ) : null}

      {omissions.length > 0 ? (
        <div className="solve-notice solve-notice--warn">
          <AlertTriangle aria-hidden="true" size={16} />
          <p>
            Not everything could be included: {omissions.join("; ")}. The model has been told exactly what is missing.
          </p>
        </div>
      ) : null}

      {status === "blocked" && configured === false ? (
        <div className="solve-notice solve-notice--warn" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          <p>
            The built-in AI is not configured on this deployment. The site operator must set <code>GEMINI_API_KEY</code>{" "}
            on the server. Until then, use one of the external options — they work without any key.
          </p>
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="solve-status" role="status" aria-live="polite">
          <Loader2 aria-hidden="true" size={20} className="solve-spin" />
          <p>Solving with the built-in IJEE AI…</p>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="solve-notice solve-notice--warn" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          <p>{error}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="solve-chip solve-chip--action"
              onClick={() => {
                if (!lastRequest.current) return;
                setStatus("loading");
                void solve(lastRequest.current.prompt);
              }}
            >
              <RefreshCw aria-hidden="true" size={14} /> Retry
            </button>
          </div>
        </div>
      ) : null}

      {turns.length > 0 ? (
        <div className="solve-transcript">
          {turns.map((turn, index) =>
            turn.role === "assistant" ? (
              <div key={index} className="solve-answer">
                <RichText text={turn.content} />
              </div>
            ) : (
              <p key={index} className="solve-followup-bubble">{turn.content}</p>
            ),
          )}
        </div>
      ) : null}

      {status === "done" || turns.length > 0 ? (
        <form
          className="solve-followup"
          onSubmit={(event) => {
            event.preventDefault();
            void sendFollowUp();
          }}
        >
          <label className="sr-only" htmlFor="solve-followup-input">Ask a follow-up about this question</label>
          <input
            id="solve-followup-input"
            className="solve-input"
            value={followUp}
            onChange={(event) => setFollowUp(event.target.value)}
            placeholder="Ask a follow-up (uses this question + the solution so far)"
            disabled={busy}
          />
          <button type="submit" className="solve-chip solve-chip--primary" disabled={busy || !followUp.trim()}>
            {busy ? <Loader2 aria-hidden="true" size={16} className="solve-spin" /> : <Send aria-hidden="true" size={16} />}
            <span>Send</span>
          </button>
        </form>
      ) : null}
    </div>
  );
}

const EXTERNAL_COPY: Record<
  Exclude<ProviderId, "ijee">,
  { transfers: ReactNode; images: ReactNode }
> = {
  google: {
    transfers: (
      <>
        Google Search receives <strong>text only</strong>: the question statement (when imported as text) plus subject
        and exam keywords. It cannot receive images through a link.
      </>
    ),
    images: (
      <>
        Google Search cannot search by image through a link. To search visually, save an image below and use{" "}
        <strong>Google Lens</strong> in the Google app — nothing is uploaded by IJEE.
      </>
    ),
  },
  gemini: {
    transfers: (
      <>
        Gemini&apos;s web app does <strong>not</strong> support link prefill, so nothing is sent automatically. Copy the
        JEE prompt, open Gemini, paste it, and attach the question images.
      </>
    ),
    images: (
      <>
        Images cannot be transferred through a URL. After pasting the prompt, attach the originals below with
        Gemini&apos;s upload button.
      </>
    ),
  },
  chatgpt: {
    transfers: (
      <>
        ChatGPT opens with the full JEE prompt <strong>prefilled in the composer</strong> (official <code>?q=</code>{" "}
        link support). Review it and press send. Images are not transferred by the link.
      </>
    ),
    images: (
      <>
        A URL cannot upload images to ChatGPT. After the prompt opens, attach the originals below with the paperclip
        icon, then send.
      </>
    ),
  },
  claude: {
    transfers: (
      <>
        Claude opens a new chat with the full JEE prompt <strong>prefilled for your review</strong> (official{" "}
        <code>?q=</code> link support). Press send when it looks right. Images are not transferred by the link.
      </>
    ),
    images: (
      <>
        A URL cannot upload images to Claude. After the prompt opens, attach the originals below with the paperclip
        icon, then send.
      </>
    ),
  },
};

function ExternalProviderPanel({
  provider,
  context,
  onCopy,
  onOpen,
  popupBlocked,
  onDismissBlocked,
  onViewImage,
  onNotice,
}: {
  provider: Exclude<ProviderId, "ijee">;
  context: QuestionContext;
  onCopy: (text: string, label: string) => Promise<boolean>;
  onOpen: (provider: string, url: string) => void;
  popupBlocked: { provider: string; url: string } | null;
  onDismissBlocked: () => void;
  onViewImage: (url: string, label: string) => void;
  onNotice: (message: string) => void;
}) {
  const externalPrompt = useMemo(() => buildExternalJeePrompt(context), [context]);
  const questionText = useMemo(() => buildQuestionTextOnly(context), [context]);
  const search = useMemo(() => buildGoogleSearchQuery(context), [context]);
  const handoff = useMemo(() => {
    if (provider === "chatgpt") return buildChatGptUrl(externalPrompt);
    if (provider === "claude") return buildClaudeUrl(externalPrompt);
    if (provider === "google") return { url: buildGoogleSearchUrl(search.query), truncated: false };
    return { url: buildGeminiUrl(), truncated: false };
  }, [provider, externalPrompt, search.query]);

  const meta = PROVIDER_META[provider];
  const primaryLabel = `Open ${meta.name}`;

  return (
    <div className="solve-external">
      <div className="solve-notice">
        <ProviderIcon provider={provider} />
        <div className="min-w-0">
          <p>{EXTERNAL_COPY[provider].transfers}</p>
        </div>
      </div>

      {search.textOnly && provider === "google" ? (
        <div className="solve-notice solve-notice--warn">
          <AlertTriangle aria-hidden="true" size={16} />
          <p>
            This question is image-based and no text was imported, so the search uses subject/chapter keywords only and
            will <strong>not</strong> find the exact question. Use the image workflow below instead.
          </p>
        </div>
      ) : null}

      {handoff.truncated ? (
        <div className="solve-notice solve-notice--warn">
          <AlertTriangle aria-hidden="true" size={16} />
          <p>
            This question makes the prompt longer than a link can reliably carry. The prefilled prompt is truncated —
            use <strong>Copy question prompt</strong> and paste it for the complete version.
          </p>
        </div>
      ) : null}

      {provider === "google" ? (
        <div className="solve-query-preview">
          <p className="solve-label">Search query</p>
          <p className="solve-query-text">{search.query}</p>
        </div>
      ) : (
        <details className="solve-prompt-preview">
          <summary>Preview the JEE prompt that will be sent</summary>
          <pre>{externalPrompt.length > 4000 ? `${externalPrompt.slice(0, 4000)}\n… (${externalPrompt.length.toLocaleString()} characters total — full text is copied)` : externalPrompt}</pre>
        </details>
      )}

      <div className="solve-actions">
        <button type="button" className="solve-primary" onClick={() => onOpen(meta.name, handoff.url)}>
          <ExternalLink aria-hidden="true" size={16} />
          <span>{primaryLabel}</span>
        </button>
        {provider !== "google" ? (
          <>
            <button type="button" className="solve-chip solve-chip--action" onClick={() => void onCopy(externalPrompt, "Question prompt")}>
              <Copy aria-hidden="true" size={14} />
              <span>Copy question prompt</span>
            </button>
            <button type="button" className="solve-chip solve-chip--action" onClick={() => void onCopy(questionText, "Question text")}>
              <Copy aria-hidden="true" size={14} />
              <span>Copy question text</span>
            </button>
          </>
        ) : null}
      </div>

      {popupBlocked && popupBlocked.provider === meta.name ? (
        <div className="solve-notice solve-notice--warn" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          <div className="min-w-0">
            <p>
              <strong>Pop-up blocked.</strong> Allow pop-ups for this site, or open the link manually:
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a href={popupBlocked.url} target="_blank" rel="noopener noreferrer" className="solve-chip solve-chip--action">
                <ExternalLink aria-hidden="true" size={14} />
                <span>Open {meta.name} in a new tab</span>
              </a>
              <button
                type="button"
                className="solve-chip solve-chip--action"
                onClick={() => void onCopy(popupBlocked.url, "Link").then((ok) => { if (ok) onDismissBlocked(); })}
              >
                <Copy aria-hidden="true" size={14} />
                <span>Copy link</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ImageAssetsPanel context={context} onViewImage={onViewImage} onNotice={onNotice} imageHelp={EXTERNAL_COPY[provider].images} />
    </div>
  );
}

function ImageAssetsPanel({
  context,
  onViewImage,
  onNotice,
  imageHelp,
}: {
  context: QuestionContext;
  onViewImage: (url: string, label: string) => void;
  onNotice: (message: string) => void;
  imageHelp: ReactNode;
}) {
  const assets = context.imageAssets;
  const [shareState, setShareState] = useState<"idle" | "unsupported" | "busy">("idle");

  async function assetToFile(asset: QuestionImageAsset) {
    const blob = await fetch(asset.objectUrl!).then((response) => response.blob());
    return new File([blob], asset.fileName, { type: blob.type || asset.mimeType });
  }

  async function shareAssets(list: QuestionImageAsset[]) {
    const available = list.filter((asset) => !asset.missing && asset.objectUrl);
    if (available.length === 0) return;
    const canShareFiles =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function";
    if (!canShareFiles) {
      setShareState("unsupported");
      return;
    }
    try {
      setShareState("busy");
      const files = await Promise.all(available.map(assetToFile));
      if (!navigator.canShare({ files })) {
        setShareState("unsupported");
        return;
      }
      await navigator.share({
        files,
        title: `JEE question ${context.displayNumber ?? ""}`.trim(),
      });
      setShareState("idle");
    } catch {
      setShareState("idle"); // user cancelled or the OS refused — not an error worth shouting about
    }
  }

  function saveAsset(asset: QuestionImageAsset) {
    if (!asset.objectUrl) return;
    const link = document.createElement("a");
    link.href = asset.objectUrl;
    link.download = asset.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotice(`Saving ${asset.fileName} — attach it in the assistant when prompted.`);
  }

  if (assets.length === 0) {
    return (
      <section className="solve-images" aria-label="Question images">
        <p className="solve-label">Question images</p>
        <p className="solve-images-empty">This question has no images — the text above is the complete question.</p>
      </section>
    );
  }

  return (
    <section className="solve-images" aria-label="Question images">
      <p className="solve-label">Question images ({assets.length}, original resolution)</p>
      <p className="solve-images-help">{imageHelp}</p>
      {assets.some((asset) => asset.missing) ? (
        <div className="solve-notice solve-notice--warn">
          <AlertTriangle aria-hidden="true" size={16} />
          <p>
            {assets.filter((asset) => asset.missing).length} of {assets.length} image
            {assets.length === 1 ? "" : "s"} could not be loaded from this browser. Reopen this paper to restore it, or
            pick the image manually from your files.
          </p>
        </div>
      ) : null}
      <ul className="solve-image-grid">
        {assets.map((asset) => (
          <li key={asset.imageId} className="solve-image-item">
            {asset.missing || !asset.objectUrl ? (
              <div className="solve-thumb solve-thumb--missing">
                <ImageOff aria-hidden="true" size={20} />
                <span>Image {asset.order} unavailable</span>
              </div>
            ) : (
              <button
                type="button"
                className="solve-thumb"
                onClick={() => onViewImage(asset.objectUrl!, `Question image ${asset.order} of ${assets.length}`)}
                aria-label={`View question image ${asset.order} of ${assets.length}`}
              >
                <img src={asset.objectUrl} alt={`Question image ${asset.order} of ${assets.length}`} loading="lazy" decoding="async" />
                <span className="solve-thumb-order">{asset.role === "question" ? "Question" : `Figure ${asset.order}`}</span>
              </button>
            )}
            <div className="solve-image-actions">
              <button type="button" className="solve-chip" disabled={asset.missing || !asset.objectUrl} onClick={() => saveAsset(asset)}>
                <Download aria-hidden="true" size={14} />
                <span>Save</span>
              </button>
              <button
                type="button"
                className="solve-chip"
                disabled={asset.missing || !asset.objectUrl}
                onClick={() => void shareAssets([asset])}
              >
                <Share2 aria-hidden="true" size={14} />
                <span>Share</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
      {assets.filter((asset) => !asset.missing).length > 1 ? (
        <button
          type="button"
          className="solve-chip solve-chip--action"
          onClick={() => void shareAssets(assets)}
        >
          <Share2 aria-hidden="true" size={14} />
          <span>Share all {assets.filter((asset) => !asset.missing).length} images</span>
        </button>
      ) : null}
      {shareState === "unsupported" ? (
        <p className="solve-images-note">
          This browser cannot share files directly. Use <strong>Save</strong> on each image and upload the saved files
          in the assistant.
        </p>
      ) : null}
      {shareState === "busy" ? (
        <p className="solve-images-note" role="status">Preparing images to share…</p>
      ) : null}
    </section>
  );
}
