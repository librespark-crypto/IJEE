import assert from "node:assert/strict";
import { chromium } from "playwright";

// Hybrid "Solve with AI" sheet regression.
//
// Start the site with `npm run start` (or `npm run dev`) and provide a
// Chromium binary, e.g.:
//   CHROMIUM_PATH=/tmp/chromium LD_LIBRARY_PATH=/tmp/al2023/lib \
//   BASE_URL=http://127.0.0.1:3000 node scripts/check-solve-sheet.mjs

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";

// 1x1 transparent PNG — enough for <img> rendering; the sheet never re-encodes.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const TEST_ID = "solve-sheet-regression";
const Q1 = `${TEST_ID}:physics:section-a:1`;
const Q2 = `${TEST_ID}:chemistry:section-a:2`;
const ONGOING_ID = "solve-sheet-ongoing";
const SUBMITTED_ID = "solve-sheet-submitted";

const storedTest = {
  id: TEST_ID,
  name: "Solve sheet regression paper",
  examType: "jee-advanced",
  kind: "practice",
  durationSeconds: 600,
  createdAt: 1,
  sourceFile: "regression.zip",
  subjects: ["Physics", "Chemistry"],
  sections: [{ subject: "Physics", name: "Section A", optionalQuestions: 0, questionIds: [Q1, Q2] }],
  questions: [
    {
      id: Q1,
      subject: "Physics",
      canonicalSubject: "Physics",
      section: "Section A",
      number: 1,
      type: "single_correct",
      marks: { cm: 4, im: -1 },
      optionCount: 4,
      msmRows: 1,
      msmCols: 4,
      correctAnswer: { kind: "choice", values: [2] },
      hasAnswerKey: true,
      imageIds: ["q1-img-1", "q1-img-2"],
      topic: "Kinematics",
    },
    {
      id: Q2,
      subject: "Chemistry",
      canonicalSubject: "Chemistry",
      section: "Section A",
      number: 2,
      type: "numerical",
      marks: { cm: 4, im: 0 },
      optionCount: 0,
      msmRows: 1,
      msmCols: 1,
      correctAnswer: { kind: "nat", raw: "6.67" },
      hasAnswerKey: true,
      imageIds: ["q2-img-1"],
    },
  ],
  validation: [],
};

function response(questionId, answer) {
  return {
    questionId,
    answer,
    pending: null,
    pendingDirty: false,
    status: answer ? "answered" : "notAnswered",
    timeSpent: 20,
  };
}

const ongoingAttempt = {
  id: ONGOING_ID,
  testId: TEST_ID,
  testName: storedTest.name,
  examType: "jee-advanced",
  kind: "practice",
  status: "ongoing",
  startedAt: Date.now() - 60_000,
  updatedAt: Date.now(),
  durationSeconds: 600,
  remainingSeconds: 540,
  currentQuestionId: Q1,
  questionOpenedAt: Date.now(),
  numbering: "cumulative",
  realExamSave: false,
  displayNumbers: { [Q1]: 1, [Q2]: 2 },
  responses: { [Q1]: response(Q1, null), [Q2]: response(Q2, null) },
};

const submittedAttempt = {
  ...ongoingAttempt,
  id: SUBMITTED_ID,
  status: "submitted",
  submittedAt: Date.now() - 1_000,
  remainingSeconds: 0,
  currentQuestionId: Q1,
  responses: {
    [Q1]: response(Q1, { kind: "choice", options: [1] }), // wrong on purpose
    [Q2]: response(Q2, { kind: "nat", value: "6.67" }),
  },
};

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 360, height: 850 }, reducedMotion: "reduce" });
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];

page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.addInitScript(() => {
  window.__opened = [];
  window.__blockPopups = false;
  window.open = function (url) {
    if (window.__blockPopups) return null;
    window.__opened.push(String(url));
    return { focus() {}, close() {}, closed: false, postMessage() {} };
  };
});

async function seed(targetPage = page) {
  await targetPage.evaluate(
    async ({ test, attempts, png }) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("fjee", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("tests")) db.createObjectStore("tests", { keyPath: "id" });
          if (!db.objectStoreNames.contains("images")) {
            const images = db.createObjectStore("images", { keyPath: "id" });
            images.createIndex("by-test", "testId");
          }
          if (!db.objectStoreNames.contains("attempts")) {
            const attemptsStore = db.createObjectStore("attempts", { keyPath: "id" });
            attemptsStore.createIndex("by-test", "testId");
          }
          if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress", { keyPath: "topicId" });
          if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
          if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(["tests", "images", "attempts"], "readwrite");
      transaction.objectStore("tests").put(test);
      transaction.objectStore("attempts").put(attempts[0]);
      transaction.objectStore("attempts").put(attempts[1]);
      // q1-img-2 is intentionally NOT stored: it must surface as a missing image.
      for (const id of ["q1-img-1", "q2-img-1"]) {
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
        transaction.objectStore("images").put({
          id,
          testId: test.id,
          blob: new Blob([bytes], { type: "image/png" }),
        });
      }
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { test: storedTest, attempts: [ongoingAttempt, submittedAttempt], png: PNG },
  );
}

async function openSheetFromExam() {
  // On mobile the exam room opens with the palette overlay covering the page.
  const closeButton = page.getByRole("button", { name: "Close", exact: true });
  await closeButton.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await closeButton.isVisible().catch(() => false)) await closeButton.click();
  await page.getByRole("button", { name: "Solve with AI" }).click();
  await page.getByRole("dialog", { name: "Solve with AI" }).waitFor();
}

async function closeSheet() {
  await page.getByRole("button", { name: "Close Solve with AI" }).click();
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
}

try {
  await page.route("**/api/ai/solve", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, configured: true }) });
      return;
    }
    const body = route.request().postDataJSON();
    const seenImages = Array.isArray(body.images) ? body.images.length : 0;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: `## Step-by-step solution\n\nFrom Newton's second law, $F = ma$.\n\nWith $m = 2$ kg and $a = 3$ m/s², $F = 6$ N.\n\n**Final answer:** B\n\n(Mocked response; ${seenImages} image(s) received.)`,
        model: "gemini-2.5-flash",
        imagesSent: seenImages,
      }),
    });
  });

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await seed();
  await page.goto(`${baseUrl}/exam/${ONGOING_ID}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Question 1").first().waitFor();
  await page.getByRole("button", { name: "Solve with AI" }).waitFor();

  // ---------- Mobile sheet: shape, providers, touch targets ----------
  await openSheetFromExam();
  assert.match(await page.locator(".solve-subtitle").textContent(), /Question 1 · Physics/);

  for (const name of ["IJEE AI", "Google Search", "Gemini", "ChatGPT", "Claude"]) {
    await page.getByRole("button", { name: new RegExp(`^${name} —`) }).waitFor();
  }
  const providerTiles = await page.locator(".solve-provider-row .solve-tile").count();
  assert.equal(providerTiles, 5, "five distinct provider rows");

  const sheetBox = await page.locator(".solve-sheet").boundingBox();
  assert.ok(sheetBox, "sheet box");
  assert.ok(Math.abs(sheetBox.y + sheetBox.height - 850) < 8, "mobile sheet anchors to the bottom");
  assert.ok(sheetBox.x < 8 && Math.abs(sheetBox.width - 360) < 8, "mobile sheet spans the viewport width");

  const targets = await page.locator('[role="dialog"] button').evaluateAll((buttons) =>
    buttons.map((button) => ({ w: button.getBoundingClientRect().width, h: button.getBoundingClientRect().height })),
  );
  assert.ok(targets.length > 0 && targets.every(({ h }) => h >= 44), "sheet buttons should meet a 44px touch target");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `mobile sheet must not widen the page (overflow ${overflow}px)`);

  // Exam room must never offer the answer-key verification toggle.
  assert.equal(await page.getByText("Verify against the official answer key").count(), 0, "no key toggle mid-exam");

  // ---------- Missing image is explicit, never silent ----------
  await page.getByRole("button", { name: /^Google Search —/ }).click();
  await page.getByText("Search query").waitFor(); // Google gets a query, not a prompt
  await page.getByText("Image 2 unavailable").waitFor();

  // ---------- Google Search: text-only handoff ----------
  assert.equal(await page.getByRole("button", { name: "Open Google Search" }).count(), 1);
  await page.getByRole("button", { name: "Open Google Search" }).click();
  assert.equal(await page.evaluate(() => window.__opened.length), 1);
  const googleUrl = await page.evaluate(() => window.__opened[0]);
  assert.ok(googleUrl.startsWith("https://www.google.com/search?q="), googleUrl);
  assert.equal(await page.getByRole("button", { name: "Copy question prompt" }).count(), 0, "search gets a query, not a prompt");

  // ---------- Blocked pop-up fallback ----------
  await page.evaluate(() => { window.__blockPopups = true; window.__opened = []; });
  await page.getByRole("button", { name: "Open Google Search" }).click();
  await page.getByText("Pop-up blocked.").waitFor();
  const fallbackLink = page.locator('.solve-notice a[href*="google.com/search"]');
  assert.ok((await fallbackLink.getAttribute("href")).startsWith("https://www.google.com/search?q="));
  await page.evaluate(() => { window.__blockPopups = false; });

  // ---------- ChatGPT: prefilled ?q= prompt + copy actions ----------
  await page.getByRole("button", { name: "Back to provider list" }).click();
  await page.getByRole("button", { name: /^ChatGPT —/ }).click();
  await page.getByText("Preview the JEE prompt that will be sent").click();
  const promptText = await page.locator(".solve-prompt-preview pre").textContent();
  assert.match(promptText, /expert JEE Mathematics, Physics, and Chemistry/);
  assert.match(promptText, /Question ID/);
  assert.doesNotMatch(promptText, /Official correct answer/, "answer key must not leak by default");

  await page.getByRole("button", { name: "Copy question prompt" }).click();
  await page.getByText("Question prompt copied").waitFor();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clipboard, /expert JEE Mathematics, Physics, and Chemistry/);
  assert.doesNotMatch(clipboard, /Official correct answer/, "clipboard prompt excludes the key");

  await page.getByRole("button", { name: "Copy question text" }).click();
  await page.getByText("Question text copied").waitFor();
  const shortText = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(shortText, /Options: A, B, C, D/);
  assert.doesNotMatch(shortText, /expert JEE/);

  await page.getByRole("button", { name: "Open ChatGPT" }).click();
  const chatgptUrl = await page.evaluate(() => window.__opened.at(-1));
  assert.ok(chatgptUrl.startsWith("https://chatgpt.com/?q="), chatgptUrl);
  assert.match(decodeURIComponent(chatgptUrl), /JEE question to solve/);

  // ---------- Gemini: no prefill — plain open + copy workflow ----------
  await page.getByRole("button", { name: "Back to provider list" }).click();
  await page.getByRole("button", { name: /^Gemini —/ }).click();
  await page.getByText("does not support link prefill", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Open Gemini" }).click();
  assert.equal(await page.evaluate(() => window.__opened.at(-1)), "https://gemini.google.com/app");

  // ---------- Claude: prefilled /new?q= ----------
  await page.getByRole("button", { name: "Back to provider list" }).click();
  await page.getByRole("button", { name: /^Claude —/ }).click();
  await page.getByRole("button", { name: "Open Claude" }).click();
  const claudeUrl = await page.evaluate(() => window.__opened.at(-1));
  assert.ok(claudeUrl.startsWith("https://claude.ai/new?q="), claudeUrl);

  // ---------- Built-in IJEE AI: solve, render, follow-up, failure ----------
  await page.getByRole("button", { name: "Back to provider list" }).click();
  await page.getByRole("button", { name: /^IJEE AI —/ }).click();
  await page.locator(".solve-answer h2").waitFor();
  assert.match(await page.locator(".solve-answer").textContent(), /Step-by-step solution/);
  assert.ok((await page.locator(".solve-answer .katex").count()) > 0, "KaTeX renders in the solution");
  await page.getByText("1 image", { exact: false }).first().waitFor(); // one sendable image (one missing)

  await page.getByLabel("Ask a follow-up about this question").fill("Why is B correct?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText("Why is B correct?").waitFor();
  await page.locator(".solve-answer").nth(1).waitFor();

  await page.route("**/api/ai/solve", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, configured: true }) });
      return;
    }
    await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "The solver request failed. Please try again." }) });
  });
  await page.getByLabel("Ask a follow-up about this question").fill("Trigger a failure");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText("The solver request failed. Please try again.").waitFor();
  assert.equal(await page.getByRole("button", { name: /Retry/ }).count(), 1, "retry appears on failure");

  // ---------- Snapshot: navigating must not swap the captured question ----------
  await page.route("**/api/ai/solve", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, configured: true }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ text: "## Solution\nAnother mocked answer for $E=mc^2$.", model: "gemini-2.5-flash" }),
    });
  });
  await closeSheet();
  await openSheetFromExam();
  await page.getByRole("button", { name: /^IJEE AI —/ }).click();
  await page.locator(".solve-answer h2").waitFor();
  // The exam room listens for arrow keys; the sheet must keep its own question.
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  assert.match(
    await page.locator(".solve-subtitle").textContent(),
    /Question 1 · Physics/,
    "sheet keeps the captured question after navigation",
  );
  await closeSheet();
  await page.getByText("Question 2").first().waitFor();
  await openSheetFromExam();
  assert.match(await page.locator(".solve-subtitle").textContent(), /Question 2 · Chemistry/);
  await closeSheet();

  // ---------- Desktop: centered dialog ----------
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSheetFromExam();
  const desktopBox = await page.locator(".solve-sheet").boundingBox();
  assert.ok(desktopBox.x > 100, "desktop dialog is centered, not full width");
  assert.ok(desktopBox.width < 800, "desktop dialog is a card");
  await closeSheet();

  // ---------- Review mode: verification workflow, key off by default ----------
  await page.setViewportSize({ width: 360, height: 850 });
  await page.goto(`${baseUrl}/analysis/${SUBMITTED_ID}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "View Solutions" }).click();
  await page.getByRole("button", { name: "Solve with AI" }).first().click();
  await page.getByText("Verify against the official answer key").waitFor();

  await page.getByRole("button", { name: /^ChatGPT —/ }).click();
  await page.getByText("Preview the JEE prompt that will be sent").click();
  assert.doesNotMatch(
    await page.locator(".solve-prompt-preview pre").textContent(),
    /Official correct answer/,
    "review handoff excludes the key until verification is selected",
  );
  await page.getByRole("button", { name: "Back to provider list" }).click();
  await page.getByText("Verify against the official answer key").click();
  await page.getByRole("button", { name: /^ChatGPT —/ }).click();
  await page.getByText("Preview the JEE prompt that will be sent").click();
  assert.match(
    await page.locator(".solve-prompt-preview pre").textContent(),
    /Official correct answer: B/,
    "verification mode includes the key",
  );

  // ---------- Dark theme ----------
  const darkContext = await browser.newContext({
    viewport: { width: 360, height: 850 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const darkPage = await darkContext.newPage();
  await darkPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await darkPage.waitForLoadState("networkidle");
  await seed(darkPage);
  await darkPage.goto(`${baseUrl}/exam/${ONGOING_ID}`, { waitUntil: "domcontentloaded" });
  const darkClose = darkPage.getByRole("button", { name: "Close", exact: true });
  await darkClose.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await darkClose.isVisible().catch(() => false)) await darkClose.click();
  await darkPage.getByRole("button", { name: "Solve with AI" }).waitFor();
  await darkPage.getByRole("button", { name: "Solve with AI" }).click();
  await darkPage.getByRole("dialog", { name: "Solve with AI" }).waitFor();
  const darkBg = await darkPage.locator(".solve-sheet").evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(darkBg, "rgb(255, 250, 243)", "dark scheme must restyle the sheet");
  await darkContext.close();

  assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join(" | ")}`);
  // "status of 502" is the intentional provider-failure scenario mocked above.
  assert.deepEqual(
    consoleErrors.filter((line) => !line.includes("favicon") && !line.includes("status of 502")),
    [],
    `Unexpected console errors: ${consoleErrors.join(" | ")}`,
  );

  console.log("Hybrid Solve-with-AI sheet regression passed (mobile + desktop, 5 providers, blocked popup, missing image, snapshot, review verification).");
} finally {
  await browser.close();
}
