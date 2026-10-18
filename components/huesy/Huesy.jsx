"use client";

import { useEffect, useState } from "react";
import { motion, useAnimate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { cx } from "../../lib/cx";

/**
 * Huesy: a small, nosy blob of colour that hears every brand move first.
 *
 * It is the product's one signature element, so it appears only where it
 * says something: the logo, the site's opening screen, while a search runs,
 * while posts are written, and in empty and error moments. Everywhere else
 * the interface stays quiet.
 *
 * mood
 *   idle     breathing gently, eyes follow the pointer
 *   watch    eyes scan side to side, colour turns faster (a search is running)
 *   found    a small hop and happy eyes (something landed)
 *   write    eyes down, as if reading the draft
 *   sleepy   half closed eyes (nothing here yet)
 *   oops     eyes to one side (something went wrong)
 *
 * The body is the two brand fills, blush and mist, turning slowly through
 * each other, which is where the name comes from. Eyes are fixed ink so it
 * reads the same on cream and on dark. Styles live in globals.css (.huesy).
 */

const MOODS = ["idle", "watch", "found", "write", "sleepy", "oops"];

// One pointer listener for every Huesy on the page.
const listeners = new Set();
let pointer = null;
let frame = 0;
function onPointer(e) {
  pointer = { x: e.clientX, y: e.clientY };
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    for (const fn of listeners) fn(pointer);
  });
}
function subscribe(fn) {
  if (!listeners.size) window.addEventListener("pointermove", onPointer, { passive: true });
  listeners.add(fn);
  if (pointer) fn(pointer);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) window.removeEventListener("pointermove", onPointer);
  };
}

const LOOK = { stiffness: 260, damping: 28, mass: 0.6 };

export default function Huesy({ mood = "idle", size = 64, className, label, track = true, still = false }) {
  const m = MOODS.includes(mood) ? mood : "idle";
  const reduced = useReducedMotion();
  const [scope, animate] = useAnimate();
  const lookX = useSpring(useMotionValue(0), LOOK);
  const lookY = useSpring(useMotionValue(0), LOOK);
  const [blink, setBlink] = useState(false);
  const reach = size * 0.055;

  // Eyes follow the pointer, a few pixels at most, while idle or found.
  useEffect(() => {
    if (reduced || !track || !(m === "idle" || m === "found")) return undefined;
    return subscribe(({ x, y }) => {
      const el = scope.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const pull = Math.min(1, dist / 280);
      lookX.set((dx / dist) * reach * pull);
      lookY.set((dy / dist) * reach * pull);
    });
  }, [reduced, track, m, reach, scope, lookX, lookY]);

  // Fixed gazes for the moods that have one, and scanning while watching.
  useEffect(() => {
    if (m === "write") {
      lookX.set(-reach * 0.5);
      lookY.set(reach * 0.8);
    } else if (m === "oops") {
      lookX.set(reach);
      lookY.set(reach * 0.3);
    } else if (m === "sleepy") {
      lookX.set(0);
      lookY.set(reach * 0.4);
    } else if (m === "watch" && !reduced) {
      let dir = 1;
      lookY.set(-reach * 0.15);
      lookX.set(reach * 1.1);
      const t = setInterval(() => {
        dir = -dir;
        lookX.set(reach * 1.1 * dir);
      }, 1100);
      return () => clearInterval(t);
    } else if (reduced || !track) {
      lookX.set(0);
      lookY.set(0);
    }
    return undefined;
  }, [m, reach, reduced, track, lookX, lookY]);

  // Blinks at uneven intervals, like something alive.
  useEffect(() => {
    if (reduced || m === "sleepy") return undefined;
    let t;
    let open;
    const schedule = () => {
      t = setTimeout(() => {
        setBlink(true);
        open = setTimeout(() => setBlink(false), 140);
        schedule();
      }, 2200 + Math.random() * 3600);
    };
    schedule();
    return () => {
      clearTimeout(t);
      clearTimeout(open);
    };
  }, [reduced, m]);

  // A hop each time it finds something.
  useEffect(() => {
    if (m !== "found" || reduced || !scope.current) return;
    animate(scope.current, { y: [0, -size * 0.16, 0] }, { duration: 0.5, ease: [0.22, 1, 0.36, 1] });
  }, [m, reduced, size, animate, scope]);

  const eyeW = size * 0.11;
  const eyeH = size * 0.15;
  const happy = m === "found";
  const eyeScaleY = blink ? 0.12 : m === "sleepy" ? 0.32 : 1;

  return (
    <span
      ref={scope}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-mood={m}
      className={cx("huesy relative inline-block shrink-0 select-none", `huesy-${m}`, still && "huesy-still", className)}
      style={{ width: size, height: size, "--s": `${size}px` }}
    >
      {m === "watch" && !reduced ? <span className="huesy-ring absolute inset-0" /> : null}
      <span className="huesy-body absolute inset-0" />
      <span className="huesy-shine absolute inset-0" />

      <motion.span
        className="absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 items-center"
        style={{ gap: size * 0.12, x: lookX, y: lookY }}
      >
        {[0, 1].map((i) => (
          <span key={i} className="relative block" style={{ width: eyeW, height: eyeH }}>
            {happy ? (
              <svg viewBox="0 0 10 8" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                <path d="M1 6.5 Q5 0.5 9 6.5" fill="none" stroke="#141414" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            ) : (
              <motion.span
                className="absolute inset-0 rounded-full bg-[#141414]"
                initial={false}
                animate={{ scaleY: eyeScaleY }}
                transition={{ duration: blink ? 0.07 : 0.22 }}
              >
                {size >= 28 ? (
                  <span
                    className="absolute rounded-full bg-white/85"
                    style={{ width: eyeW * 0.34, height: eyeW * 0.34, top: eyeH * 0.16, left: eyeW * 0.2 }}
                  />
                ) : null}
              </motion.span>
            )}
          </span>
        ))}
      </motion.span>

      {m === "oops" ? (
        <span
          className="absolute rounded-full bg-[#141414]"
          style={{ width: size * 0.09, height: Math.max(1.5, size * 0.024), left: "54%", top: "64%" }}
        />
      ) : null}
    </span>
  );
}
