"use client";

import { isValidElement, useMemo, useState, type ReactElement, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

type CodeElementProps = {
  className?: string;
  children?: ReactNode;
};

const markdownComponents: Components = {
  a({ href, title, children }) {
    return (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  code({ className, children, node: _node, ...props }) {
    const isBlockCode = Boolean(className?.split(/\s+/).some((name) => name.startsWith("language-")));
    return (
      <code
        {...props}
        className={className ?? (isBlockCode ? "" : "rich-inline-code")}
      >
        {children}
      </code>
    );
  },
  img({ src, alt, title }) {
    // eslint-disable-next-line @next/next/no-img-element -- AI-generated image URLs are dynamic and user supplied.
    return <img src={src} alt={alt ?? ""} title={title} loading="lazy" decoding="async" />;
  },
  pre({ children }) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  span({ className, children, node: _node, ...props }) {
    const classes = className?.split(/\s+/) ?? [];
    if (classes.includes("katex-display")) {
      return (
        <div
          className="math-scroll"
          role="region"
          aria-label="Display equation; swipe horizontally if needed"
          tabIndex={0}
        >
          <span {...props} className={className}>
            {children}
          </span>
          <p className="wide-content-hint">Swipe horizontally if needed <span aria-hidden="true">→</span></p>
        </div>
      );
    }
    return <span {...props} className={className}>{children}</span>;
  },
  table({ children }) {
    return (
      <div className="table-scroll-frame">
        <div
          className="table-scroll"
          role="region"
          aria-label="Markdown table; swipe horizontally to see all columns"
          tabIndex={0}
        >
          <table>{children}</table>
        </div>
        <p className="wide-content-hint">Swipe horizontally if needed <span aria-hidden="true">→</span></p>
      </div>
    );
  },
};

export function RichText({ text }: { text: string }) {
  const markdown = useMemo(() => normalizeLatexDelimiters(text), [text]);
  return (
    <div className="rich-text" data-rich-text>
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {markdown}
      </Markdown>
    </div>
  );
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copyStatus, setCopyStatus] = useState("");
  const code = textContent(children);

  async function copyCode() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard is unavailable.");
      await navigator.clipboard.writeText(code);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy unavailable");
    }
  }

  return (
    <div className="code-block-frame">
      <div className="code-block-toolbar">
        <span>Code</span>
        <button type="button" onClick={() => void copyCode()} aria-label="Copy code block">
          Copy
        </button>
        <span className="sr-only" role="status" aria-live="polite">{copyStatus}</span>
      </div>
      <pre
        className="code-block-scroll"
        role="region"
        aria-label="Code block; swipe horizontally to read long lines"
        tabIndex={0}
      >
        {children}
      </pre>
      <p className="wide-content-hint">Swipe horizontally if needed <span aria-hidden="true">→</span></p>
    </div>
  );
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isReactElementWithChildren(node)) return textContent(node.props.children);
  return "";
}

function isReactElementWithChildren(node: ReactNode): node is ReactElement<CodeElementProps> {
  return isValidElement<CodeElementProps>(node);
}

/**
 * Keep the legacy \(...\) and \[...\] delimiters Gemini often emits, while
 * leaving fenced and inline code byte-for-byte unchanged for Markdown parsing.
 */
function normalizeLatexDelimiters(markdown: string) {
  let output = "";
  let index = 0;

  while (index < markdown.length) {
    if (index === 0 || markdown[index - 1] === "\n") {
      const lineEnd = markdown.indexOf("\n", index);
      const headerEnd = lineEnd === -1 ? markdown.length : lineEnd;
      const header = markdown.slice(index, headerEnd);
      const fence = header.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fence) {
        const marker = fence[1]!;
        const fenceCharacter = marker[0]!;
        const closingFence = new RegExp(`^ {0,3}${fenceCharacter}{${marker.length},}[\\t ]*$`);
        let cursor = lineEnd === -1 ? markdown.length : lineEnd + 1;
        let end = markdown.length;

        while (cursor < markdown.length) {
          const nextLineEnd = markdown.indexOf("\n", cursor);
          const nextEnd = nextLineEnd === -1 ? markdown.length : nextLineEnd;
          if (closingFence.test(markdown.slice(cursor, nextEnd))) {
            end = nextLineEnd === -1 ? markdown.length : nextLineEnd + 1;
            break;
          }
          cursor = nextLineEnd === -1 ? markdown.length : nextLineEnd + 1;
        }

        output += markdown.slice(index, end);
        index = end;
        continue;
      }
    }

    if (markdown[index] === "`") {
      let tickCount = 1;
      while (markdown[index + tickCount] === "`") tickCount += 1;
      const delimiter = "`".repeat(tickCount);
      const closing = markdown.indexOf(delimiter, index + tickCount);
      if (closing !== -1) {
        const end = closing + tickCount;
        output += markdown.slice(index, end);
        index = end;
        continue;
      }
    }

    if (markdown.startsWith("\\[", index)) {
      const closing = markdown.indexOf("\\]", index + 2);
      if (closing !== -1) {
        const formula = markdown.slice(index + 2, closing).trim();
        output += `\n\n$$\n${formula}\n$$\n\n`;
        index = closing + 2;
        continue;
      }
    }

    if (markdown.startsWith("\\(", index)) {
      const closing = markdown.indexOf("\\)", index + 2);
      if (closing !== -1) {
        const formula = markdown.slice(index + 2, closing);
        output += formula.includes("\n") ? `\n\n$$\n${formula.trim()}\n$$\n\n` : `$${formula}$`;
        index = closing + 2;
        continue;
      }
    }

    output += markdown[index];
    index += 1;
  }

  return output;
}
