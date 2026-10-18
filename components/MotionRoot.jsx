"use client";

import { MotionConfig } from "motion/react";

// Every Motion animation follows the reader's reduced motion setting: with it
// on, transforms are dropped and only fades remain.
export default function MotionRoot({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
