"use client";

import { useEffect, useState } from "react";
import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { Segmented } from "./ui";

const KEY = "huesy:theme";
const EVENT = "huesy:theme";
const BAR = { light: "#fcf5ef", dark: "#141414" };

const CHOICES = [
  { id: "system", icon: Desktop, short: "Device", long: "Match my device" },
  { id: "light", icon: Sun, short: "Light", long: "Light" },
  { id: "dark", icon: Moon, short: "Dark", long: "Dark" },
];

const read = () => {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
};

// Puts a choice on the page: the theme, eased, and the browser bar colour
// (one colour for a fixed choice, each meta's own media query for "system").
function apply(choice) {
  const root = document.documentElement;
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.add("theme-easing");
  root.setAttribute("data-theme", dark ? "dark" : "light");
  window.setTimeout(() => root.classList.remove("theme-easing"), 400);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const tone = choice === "system" ? ((meta.getAttribute("media") || "").includes("dark") ? "dark" : "light") : choice;
    meta.setAttribute("content", BAR[tone]);
  });
}

/**
 * Light, dark, or the same as the device (the default). The choice stays in
 * this browser; the script in app/layout.js applies it before the first paint.
 * Every switch on the page, and in other tabs, moves together.
 */
export default function ThemeSwitch({ labels = false, className }) {
  const [choice, setChoice] = useState("system");

  useEffect(() => {
    setChoice(read());
    const here = (e) => setChoice(e.detail);
    const otherTab = (e) => {
      if (e.key !== KEY) return;
      const next = read();
      setChoice(next);
      apply(next);
    };
    window.addEventListener(EVENT, here);
    window.addEventListener("storage", otherTab);
    return () => {
      window.removeEventListener(EVENT, here);
      window.removeEventListener("storage", otherTab);
    };
  }, []);

  const pick = (next) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* still switches for this visit */
    }
    apply(next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  };

  const options = CHOICES.map(({ id, icon: Icon, short, long }) => ({
    id,
    label: (
      <span className="inline-flex items-center gap-1.5" title={long}>
        <Icon size={14} weight={choice === id ? "fill" : "regular"} aria-hidden="true" />
        {labels ? short : <span className="sr-only">{long}</span>}
      </span>
    ),
  }));

  return (
    <Segmented
      label="Appearance"
      size="sm"
      options={options}
      value={choice}
      onChange={pick}
      className={className}
      itemClassName={labels ? undefined : "inline-flex items-center justify-center pointer-coarse:min-w-11"}
    />
  );
}
