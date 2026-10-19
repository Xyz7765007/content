"use client";

import { Fragment } from "react";
import { cx } from "../lib/cx";

/**
 * The small slice of markdown Huesy writes: paragraphs, ### headings, bullet
 * and numbered lists, | tables |, **bold**, *italic* and [links](https://…). Built as
 * React elements, never as HTML, so nothing in an answer can run as code.
 * Links open in a new tab and only http(s) addresses become links.
 */

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?:\/\/)[^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function inline(text, key = "i") {
  const parts = String(text).split(INLINE);
  return parts.map((part, i) => {
    const k = `${key}-${i}`;
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={k} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a key={k} href={link[2]} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-deep underline decoration-accent-line underline-offset-2 hover:decoration-accent-deep">
          {link[1]}
        </a>
      );
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={k}>{part.slice(1, -1)}</em>;
    return <Fragment key={k}>{part}</Fragment>;
  });
}

// "| a | b |" -> ["a", "b"]
const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const RULE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

function blocks(src) {
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  const out = [];
  let para = [];
  let list = null;
  let table = null;
  const flushPara = () => {
    if (para.length) out.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list) out.push(list);
    list = null;
  };
  const flushTable = () => {
    if (table) out.push(table);
    table = null;
  };
  for (const [n, raw] of lines.entries()) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      flushTable();
      continue;
    }
    // A table: a "| head |" row, a "|---|" rule, then "| cell |" rows.
    if (table && trimmed.startsWith("|")) {
      if (!RULE.test(trimmed)) table.rows.push(cells(trimmed));
      continue;
    }
    flushTable();
    if (trimmed.startsWith("|") && RULE.test(String(lines[n + 1] || "").trim())) {
      flushPara();
      flushList();
      table = { type: "table", head: cells(trimmed), rows: [] };
      continue;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    const numbered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      out.push({ type: "h", text: heading[2] });
    } else if (bullet || numbered) {
      flushPara();
      const kind = bullet ? "ul" : "ol";
      if (!list || list.type !== kind) {
        flushList();
        list = { type: kind, items: [] };
      }
      list.items.push(bullet ? bullet[1] : numbered[2]);
    } else if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += ` ${trimmed}`;
    } else {
      flushList();
      para.push(trimmed);
    }
  }
  flushPara();
  flushList();
  flushTable();
  return out;
}

// One line of inline markdown (bold, italic, links), for headlines and summaries.
export function InlineMarkdown({ children }) {
  return <>{inline(children, "l")}</>;
}

export default function Markdown({ children, className }) {
  const parsed = blocks(children);
  return (
    <div className={cx("md flex flex-col gap-3 text-[15px] leading-relaxed text-ink/90 [overflow-wrap:anywhere]", className)}>
      {parsed.map((b, i) => {
        if (b.type === "h") return <h4 key={i} className="mt-2 text-[14.5px] font-semibold text-ink first:mt-0">{inline(b.text, i)}</h4>;
        if (b.type === "ul")
          return (
            <ul key={i} className="flex flex-col gap-1.5 pl-1">
              {b.items.map((it, j) => (
                <li key={j} className="relative pl-4 before:absolute before:left-0 before:top-[0.62em] before:h-[5px] before:w-[5px] before:rounded-full before:bg-accent-deep/70">
                  {inline(it, `${i}-${j}`)}
                </li>
              ))}
            </ul>
          );
        if (b.type === "ol")
          return (
            <ol key={i} className="flex flex-col gap-1.5 pl-1">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="tabular w-4 shrink-0 text-right text-muted">{j + 1}.</span>
                  <span className="min-w-0">{inline(it, `${i}-${j}`)}</span>
                </li>
              ))}
            </ol>
          );
        if (b.type === "table")
          return (
            <div key={i} className="-mx-1 overflow-x-auto px-1">
              <table className="w-full border-collapse text-left text-[13.5px] [overflow-wrap:normal]">
                <thead>
                  <tr className="border-b border-line-strong">
                    {b.head.map((h, j) => (
                      <th key={j} scope="col" className="whitespace-nowrap py-2 pr-4 font-medium text-muted">
                        {inline(h, `${i}-h${j}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j} className="border-b border-line last:border-0">
                      {b.head.map((_, k) => (
                        <td key={k} className={cx("py-2 pr-4 align-top", k === 0 ? "font-medium text-ink" : "tabular")}>
                          {inline(r[k] ?? "", `${i}-${j}-${k}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        return <p key={i}>{inline(b.text, i)}</p>;
      })}
    </div>
  );
}
