"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment } from "react";

export function RichText({ text }: { text: string }) {
  const parts = splitMath(text);
  return (
    <div className="space-y-2 leading-7">
      {parts.map((part, index) =>
        part.math ? (
          <span
            key={index}
            className={part.display ? "block overflow-x-auto py-1" : "inline-block px-0.5"}
            dangerouslySetInnerHTML={{ __html: render(part.value, part.display) }}
          />
        ) : (
          <Fragment key={index}>{part.value}</Fragment>
        ),
      )}
    </div>
  );
}

function render(value: string, display: boolean) {
  try {
    return katex.renderToString(value, { displayMode: display, throwOnError: false, strict: "ignore" });
  } catch {
    return escapeHtml(value);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function splitMath(text: string) {
  const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
  const parts: { value: string; math: boolean; display: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ value: text.slice(last, index), math: false, display: false });
    const display = Boolean(match[1] || match[2]);
    parts.push({ value: match[1] || match[2] || match[3] || match[4] || "", math: true, display });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ value: text.slice(last), math: false, display: false });
  return parts;
}
