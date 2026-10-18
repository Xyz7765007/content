import { twMerge } from "tailwind-merge";

/**
 * Joins class names and resolves Tailwind conflicts so the LAST value wins.
 * Plain concatenation leaves the winner up to stylesheet order, which silently
 * broke three components during the build: a base `inline-flex` beat a caller's
 * `hidden`, a base `w-full` beat `w-auto`, and `relative` beat `absolute`.
 */
export function cx(...parts) {
  return twMerge(parts.filter(Boolean).join(" "));
}
