import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

// Start the site with `npm run dev` (or `npm run start`) and install the browser once via `npx playwright install chromium`.
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const fixture = await readFile(new URL("../tests/fixtures/long-ai-response.md", import.meta.url), "utf8");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 360, height: 850 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
let sentClientApiKey = false;

page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.route("https://ijee.vercel.app/images/journey.jpg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600"><rect width="1200" height="600" fill="#f3eadc"/></svg>',
  }));

  await page.goto(`${baseUrl}/tutor`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Ask the AI tutor" }).waitFor();

  await page.evaluate(async (longResponse) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("fjee", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [name, keyPath] of [["tests", "id"], ["images", "id"], ["attempts", "id"], ["progress", "topicId"], ["settings", "id"], ["chats", "id"]]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const mediumResponse = `## Medium JEE response\n\n1. Start from Newton's second law, $\\vec{F}=m\\vec{a}$.\n2. Resolve the force along the chosen axis.\n\n- Check the sign convention.\n- Verify the SI units.\n\n> Keep assumptions visible before substituting values.`;
    const thread = {
      id: "responsive-layout-regression",
      title: "Mobile long-response regression",
      updatedAt: 3,
      messages: [
        { role: "user", content: "Give me a short explanation.", at: 1 },
        { role: "assistant", content: "A short answer: acceleration is the rate of change of velocity.", at: 2 },
        { role: "user", content: "Show a medium JEE explanation.", at: 3 },
        { role: "assistant", content: mediumResponse, at: 4 },
        { role: "user", content: "Explain this with every Markdown and math case.", at: 5 },
        { role: "assistant", content: longResponse, at: 6 },
      ],
    };
    const transaction = database.transaction("chats", "readwrite");
    transaction.objectStore("chats").put(thread);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, fixture);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".tutor-panel .rich-text h1").waitFor();

  const rendererAudit = await page.evaluate(() => ({
    headings: document.querySelectorAll(".rich-text h1, .rich-text h2").length,
    orderedLists: document.querySelectorAll(".rich-text ol").length,
    unorderedLists: document.querySelectorAll(".rich-text ul").length,
    blockquotes: document.querySelectorAll(".rich-text blockquote").length,
    links: document.querySelectorAll(".rich-text a").length,
    inlineCode: [...document.querySelectorAll(".rich-text code")].some((code) => !code.closest("pre")),
    codeRegions: document.querySelectorAll(".code-block-scroll").length,
    tables: document.querySelectorAll(".table-scroll table").length,
    displayMath: document.querySelectorAll(".math-scroll .katex-display").length,
    inlineMath: [...document.querySelectorAll(".rich-text .katex")].some((math) => !math.closest(".math-scroll")),
    wideInlineMath: [...document.querySelectorAll(".rich-text .katex")].some((math) => !math.closest(".math-scroll") && math.scrollWidth > math.clientWidth),
    images: document.querySelectorAll(".rich-text img").length,
    horizontalRules: document.querySelectorAll(".rich-text hr").length,
    viewport: document.querySelector('meta[name="viewport"]')?.content ?? "",
  }));

  assert.ok(rendererAudit.headings >= 3, "Markdown headings should render");
  assert.ok(rendererAudit.orderedLists > 0 && rendererAudit.unorderedLists > 0, "Ordered and unordered lists should render");
  assert.ok(rendererAudit.blockquotes > 0 && rendererAudit.links > 0, "Blockquotes and links should render");
  assert.ok(rendererAudit.inlineCode && rendererAudit.codeRegions > 0, "Inline and block code should render");
  assert.ok(rendererAudit.tables > 0, "GFM tables should render");
  assert.ok(rendererAudit.displayMath > 0 && rendererAudit.inlineMath, "Inline and display KaTeX should render");
  assert.ok(rendererAudit.wideInlineMath, "A wide inline equation should remain inline and swipe locally");
  assert.ok(rendererAudit.images > 0 && rendererAudit.horizontalRules > 0, "Images and horizontal rules should render");
  assert.match(rendererAudit.viewport, /width=device-width/);
  assert.match(rendererAudit.viewport, /viewport-fit=cover/);

  const widths = [320, 360, 375, 390, 412, 430, 768, 1024, 1280];
  const measurements = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => {
      const root = document.documentElement;
      const layout = document.querySelector(".tutor-layout");
      const panel = document.querySelector(".tutor-panel");
      const image = document.querySelector(".rich-text img");
      const response = image?.closest(".rich-text") ?? document.querySelector(".tutor-message .rich-text");
      const table = document.querySelector(".table-scroll");
      const code = document.querySelector(".code-block-scroll");
      const math = document.querySelector(".math-scroll");
      return {
        viewport: root.clientWidth,
        page: root.scrollWidth,
        body: document.body.scrollWidth,
        layout: layout?.scrollWidth ?? 0,
        layoutClient: layout?.clientWidth ?? 0,
        columns: getComputedStyle(layout).gridTemplateColumns.split(" ").length,
        panel: panel?.scrollWidth ?? 0,
        panelClient: panel?.clientWidth ?? 0,
        response: response?.getBoundingClientRect().width ?? 0,
        tableClient: table?.clientWidth ?? 0,
        tableScroll: table?.scrollWidth ?? 0,
        codeClient: code?.clientWidth ?? 0,
        codeScroll: code?.scrollWidth ?? 0,
        mathClient: math?.clientWidth ?? 0,
        mathScroll: math?.scrollWidth ?? 0,
        pageHeight: root.scrollHeight,
        viewportHeight: root.clientHeight,
        imageMaxWidth: image ? getComputedStyle(image).maxWidth : "",
        imageWidth: image?.getBoundingClientRect().width ?? 0,
        responseWidth: response?.getBoundingClientRect().width ?? 0,
        overflowX: getComputedStyle(root).overflowX,
      };
    });
    measurements.push({ width, ...result });

    assert.ok(result.page <= result.viewport, `Document overflows horizontally at ${width}px: ${result.page}px`);
    assert.ok(result.body <= result.viewport, `Body overflows horizontally at ${width}px: ${result.body}px`);
    assert.ok(result.layout <= result.layoutClient, `Tutor grid overflows at ${width}px`);
    assert.ok(result.panel <= result.panelClient, `Chat panel overflows at ${width}px`);
    assert.ok(result.response <= result.panelClient, `AI message exceeds panel at ${width}px`);
    assert.ok(result.tableScroll >= result.tableClient, `Table region is missing at ${width}px`);
    assert.ok(result.codeScroll >= result.codeClient, `Code region is missing at ${width}px`);
    assert.ok(result.mathScroll >= result.mathClient, `Math region is missing at ${width}px`);
    assert.ok(result.pageHeight > result.viewportHeight, `Long answer should scroll vertically at ${width}px`);
    assert.equal(result.overflowX === "hidden" || result.overflowX === "clip", false, "Do not hide root overflow to mask a layout bug");
    assert.ok(result.imageWidth <= result.responseWidth, `Image exceeds response width at ${width}px`);
    assert.equal(result.imageMaxWidth, "100%");
    if (width <= 430) assert.equal(result.columns, 1, `Mobile chat should stay single-column at ${width}px`);
    if (width >= 1024) assert.equal(result.columns, 2, `Desktop sidebar layout should remain at ${width}px`);
  }

  await page.setViewportSize({ width: 360, height: 850 });
  for (const selector of [".table-scroll", ".code-block-scroll", ".math-scroll"]) {
    const region = page.locator(selector).first();
    await region.focus();
    const focusable = await region.evaluate((element) => document.activeElement === element);
    assert.equal(focusable, true, `${selector} should be keyboard focusable`);
    const localSwipeWorks = await region.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      return element.scrollLeft > 0;
    });
    assert.equal(localSwipeWorks, true, `${selector} should scroll horizontally within its own region`);
  }
  const touchTargets = await page.locator(".tutor-panel button").evaluateAll((buttons) =>
    buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
  );
  assert.ok(touchTargets.length > 0 && touchTargets.every(({ width, height }) => width >= 44 && height >= 44), "Tutor buttons should meet a 44px touch target");
  const unbrokenTextWraps = await page.locator(".rich-text").last().evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent?.startsWith("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")) {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects().length > 1;
      }
    }
    return false;
  });
  assert.equal(unbrokenTextWraps, true, "Long unbroken response text should wrap inside the bubble");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  assert.ok(await page.evaluate(() => window.scrollY > 0), "The long response should remain vertically scrollable");

  await page.route("**/api/gemini", async (route) => {
    const requestBody = route.request().postDataJSON();
    sentClientApiKey ||= Object.hasOwn(requestBody, "apiKey");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ text: "Mocked short tutor answer: $F=ma$." }),
    });
  });
  await page.getByRole("textbox", { name: "Ask the AI tutor" }).fill("Give me one short JEE hint.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Mocked short tutor answer:").waitFor();
  assert.equal(sentClientApiKey, false, "The browser must not send a Gemini API key");

  await page.unroute("**/api/gemini");
  await page.route("**/api/gemini", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ error: `GEMINI_ERROR_${"UNBROKEN_ERROR_IDENTIFIER_".repeat(80)}` }),
  }));
  await page.getByRole("textbox", { name: "Ask the AI tutor" }).fill("Show me a long error state.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("alert").waitFor();
  const errorPageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.equal(errorPageWidth, 360, "Long API errors must not widen the page");
  assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join(" | ")}`);
  assert.deepEqual(consoleErrors, [], `Unexpected console errors: ${consoleErrors.join(" | ")}`);

  console.log("Responsive AI Tutor regression passed.");
  console.table(measurements.map((item) => ({
    viewport: item.width,
    documentWidth: item.page,
    panelWidth: item.panelClient,
    pageHeight: item.pageHeight,
    table: `${item.tableClient}/${item.tableScroll}`,
    code: `${item.codeClient}/${item.codeScroll}`,
    math: `${item.mathClient}/${item.mathScroll}`,
  })));
} finally {
  await browser.close();
}
