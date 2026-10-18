"use client";

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, CircleNotch, Warning, X } from "@phosphor-icons/react";
import { cx } from "../lib/cx";
import Huesy from "./huesy/Huesy";

export { cx };

/* ------------------------------------------------------------------ motion --
   One spring for the whole product: critically damped (no overshoot), fast to
   settle. Bounce is kept for the one moment that carries momentum (a sheet
   flicked shut). Reduced motion swaps movement for a short cross fade.
----------------------------------------------------------------------------- */

export const SPRING = { type: "spring", bounce: 0, duration: 0.38 };
export const SPRING_SOFT = { type: "spring", bounce: 0, duration: 0.5 };
export const FADE = { duration: 0.18, ease: [0.22, 1, 0.36, 1] };

/* ------------------------------------------------------------------ button --
   Radius lock: every button and chip is a pill. Cards are 20px, inputs 12px.
   Feedback lands on pointer-down (scale 0.97), not on release.
----------------------------------------------------------------------------- */

const PRESS = "transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-150 active:scale-[0.97] active:duration-75";

const BTN_BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap " +
  PRESS +
  " disabled:pointer-events-none disabled:opacity-45";

const BTN_VARIANTS = {
  primary:
    "bg-accent text-[#141414] shadow-soft hover:brightness-[0.97] hover:shadow-card border border-accent-line",
  solid: "bg-ink text-canvas hover:opacity-90 border border-ink",
  quiet: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-raised",
  ghost: "bg-transparent text-muted hover:text-ink hover:bg-sunken border border-transparent",
  danger: "bg-danger-soft text-danger border border-danger/25 hover:brightness-[0.98]",
};

// On touch screens every control is at least 44px tall (Apple's default).
const BTN_SIZES = {
  sm: "h-8 px-3.5 text-[13px] pointer-coarse:h-11",
  md: "h-10 px-5 text-sm pointer-coarse:h-11",
  lg: "h-12 px-7 text-[15px]",
};

export const Button = forwardRef(function Button(
  { as: Tag = "button", variant = "primary", size = "md", className, loading, children, ...rest },
  ref
) {
  return (
    <Tag
      ref={ref}
      className={cx(BTN_BASE, BTN_VARIANTS[variant], BTN_SIZES[size], className)}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {loading ? <CircleNotch size={16} className="animate-spin" weight="bold" aria-hidden="true" /> : null}
      {children}
    </Tag>
  );
});

export const IconButton = forwardRef(function IconButton(
  { label, variant = "ghost", size = 36, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      style={{ "--ib": `${size}px` }}
      className={cx(
        "inline-flex h-[var(--ib)] w-[var(--ib)] shrink-0 items-center justify-center rounded-full pointer-coarse:h-11 pointer-coarse:w-11",
        PRESS,
        variant === "ghost" && "text-muted hover:text-ink hover:bg-sunken",
        variant === "quiet" && "border border-line bg-surface text-ink hover:border-line-strong",
        variant === "accent" && "bg-accent text-[#141414] border border-accent-line",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------- paper -- */

export function Card({ as: Tag = "div", className, children, ...rest }) {
  return (
    <Tag className={cx("rounded-[20px] border border-line bg-surface", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, sub, className, as: Tag = "h2" }) {
  return (
    <div className={cx("mb-5", className)}>
      <Tag className="display-lg text-[24px] sm:text-[28px]">{children}</Tag>
      {sub ? <p className="mt-1.5 max-w-[62ch] text-sm text-muted">{sub}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- form --
   Label above the control, helper in markup, error below. No placeholder as
   label anywhere in the app.
----------------------------------------------------------------------------- */

export function Field({ label, hint, error, required, htmlFor, children, className, aside }) {
  // The asterisk sits outside the label element, so a field is announced as
  // "Niche" rather than "Niche star", and the requirement is carried on the
  // control itself where assistive tech expects it.
  const control =
    required && isValidElement(children) ? cloneElement(children, { "aria-required": "true" }) : children;

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {label ? (
        <span className="flex items-baseline justify-between gap-3">
          <span className="flex items-baseline gap-1">
            <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
              {label}
            </label>
            {required ? (
              <span aria-hidden="true" className="text-[13px] text-accent-deep">
                *
              </span>
            ) : null}
          </span>
          {aside}
        </span>
      ) : null}
      {hint ? <p className="-mt-1 text-xs leading-relaxed text-muted">{hint}</p> : null}
      {control}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-danger" role="alert">
          <Warning size={13} weight="fill" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border border-line bg-raised px-3.5 text-[15px] text-ink sm:text-sm " +
  "placeholder:text-faint transition-[border-color,box-shadow] duration-150 " +
  "hover:border-line-strong focus:border-accent-deep focus:outline-none " +
  "focus:ring-4 focus:ring-accent/40";

export const Input = forwardRef(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(CONTROL, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx(CONTROL, "resize-y py-3 leading-relaxed", className)} {...rest} />;
});

export function Select({ className, children, ...rest }) {
  return (
    <select className={cx(CONTROL, "h-11 cursor-pointer pr-9", className)} {...rest}>
      {children}
    </select>
  );
}

export function Chip({ selected, className, children, as: Tag = "button", ...rest }) {
  return (
    <Tag
      type={Tag === "button" ? "button" : undefined}
      aria-pressed={Tag === "button" ? Boolean(selected) : undefined}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] pointer-coarse:min-h-11",
        PRESS,
        selected
          ? "border-ink bg-ink text-canvas font-medium"
          : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Badge({ tone = "neutral", className, children }) {
  const tones = {
    neutral: "border-line bg-sunken text-muted",
    accent: "border-accent-line bg-accent-soft text-accent-deep",
    mist: "border-mist bg-mist-soft text-mist-deep",
    solid: "border-ink bg-ink text-canvas",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11px] font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Checkbox({ checked, onChange, label, description, id, className }) {
  const auto = useId();
  const inputId = id || auto;
  return (
    <label htmlFor={inputId} className={cx("flex cursor-pointer items-start gap-3 text-left", className)}>
      <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[6px] border border-line-strong bg-raised transition-colors checked:border-accent-line checked:bg-accent"
        />
        <Check
          size={12}
          weight="bold"
          color="#141414"
          aria-hidden="true"
          className="pointer-events-none absolute scale-50 opacity-0 transition duration-150 peer-checked:scale-100 peer-checked:opacity-100"
        />
      </span>
      {label ? (
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">{label}</span>
          {description ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}

/* --------------------------------------------------------------- segmented --
   A small set of mutually exclusive choices. The selected pill slides between
   options with the house spring.
----------------------------------------------------------------------------- */

// Left and right arrows move between options, as a native control would.
function arrowKeys(e, ids, current, onChange) {
  const i = ids.indexOf(current);
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  e.preventDefault();
  const next = ids[(i + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
  onChange(next);
  e.currentTarget.parentElement?.querySelectorAll("button")[ids.indexOf(next)]?.focus();
}

export function Segmented({ options, value, onChange, className, itemClassName, label, size = "md" }) {
  const id = useId();
  const ids = options.map((o) => o.id);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx("inline-flex max-w-full items-center gap-0.5 self-start rounded-full border border-line bg-sunken p-1", className)}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => arrowKeys(e, ids, value, onChange)}
            className={cx(
              "relative whitespace-nowrap rounded-full transition-colors duration-150 pointer-coarse:min-h-11",
              size === "sm" ? "px-3 py-1 text-[12.5px]" : "px-4 py-1.5 text-[13px]",
              on ? "font-medium text-ink" : "text-muted hover:text-ink",
              itemClassName
            )}
          >
            {on ? (
              <motion.span
                layoutId={`seg-${id}`}
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-surface shadow-soft"
              />
            ) : null}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ states -- */

export function Skeleton({ className }) {
  return <div className={cx("skeleton rounded-xl", className)} aria-hidden="true" />;
}

export function SignalSkeleton() {
  return (
    <div className="rounded-[20px] border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
    </div>
  );
}

// Empty screens are Huesy's to fill: a mood, one sentence, and the next step.
export function EmptyState({ mood = "sleepy", icon: Icon, title, body, action, className }) {
  return (
    <div
      className={cx(
        "flex flex-col items-center rounded-[20px] border border-dashed border-line-strong bg-surface px-6 py-14 text-center",
        className
      )}
    >
      {Icon ? (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
          <Icon size={22} />
        </span>
      ) : (
        <Huesy mood={mood} size={56} className="mb-5" />
      )}
      <h3 className="font-display text-xl">{title}</h3>
      {body ? <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children, onRetry, retryLabel = "Try again", action, className }) {
  return (
    <div
      role="alert"
      className={cx(
        "flex flex-wrap items-center gap-3 rounded-[20px] border border-danger/25 bg-danger-soft px-4 py-3.5",
        className
      )}
    >
      <Huesy mood="oops" size={30} track={false} />
      <p className="min-w-0 flex-1 text-sm text-danger">{children}</p>
      {action}
      {onRetry ? (
        <Button size="sm" variant="quiet" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- progress --
   Determinate when the length is known, a travelling wave when it is not.
----------------------------------------------------------------------------- */

export function Progress({ value, label, detail, indeterminate = false }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div>
      {label ? (
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <span className="text-sm font-medium text-ink">{label}</span>
          {!indeterminate ? <span className="meta tabular">{Math.round(pct)}%</span> : null}
        </div>
      ) : null}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Progress"}
      >
        {indeterminate ? (
          <div className="progress-wave h-full w-full" />
        ) : (
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {detail ? <p className="mt-2 truncate text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- toast --
   Call toast("Saved", { action: { label: "Undo", onClick } }) from anywhere.
   ToastHost (mounted once per layout) shows them bottom centre, springs them
   in and out on the same path, and pauses the timer while hovered.
----------------------------------------------------------------------------- */

let toasts = [];
const toastListeners = new Set();
const emitToasts = () => toastListeners.forEach((fn) => fn());
let toastSeq = 0;

export function toast(message, opts = {}) {
  const id = ++toastSeq;
  toasts = [...toasts.slice(-2), { id, message, ...opts }];
  emitToasts();
  return id;
}
export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

const subscribeToasts = (fn) => {
  toastListeners.add(fn);
  return () => toastListeners.delete(fn);
};
const getToasts = () => toasts;
const getServerToasts = () => [];

function ToastItem({ t }) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held) return undefined;
    const timer = setTimeout(() => dismissToast(t.id), t.duration || (t.action ? 10000 : 4000));
    return () => clearTimeout(timer);
  }, [held, t]);

  return (
    <motion.div
      layout
      role="status"
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.96 }}
      transition={SPRING}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onPointerDown={() => setHeld(true)}
      className="pointer-events-auto flex max-w-[calc(100vw-32px)] items-center gap-3 rounded-full border border-[#141414] bg-[#141414] py-2 pl-5 pr-2 text-sm text-[#fcf5ef] shadow-float dark:border-[#403b37]"
    >
      {t.tone === "good" ? <Check size={15} weight="bold" className="shrink-0 text-[#ffc2d1]" /> : null}
      <span className="min-w-0 truncate">{t.message}</span>
      {t.action ? (
        <button
          type="button"
          onClick={() => {
            t.action.onClick?.();
            dismissToast(t.id);
          }}
          className="min-h-9 shrink-0 rounded-full bg-white/10 px-3.5 text-[13px] font-medium text-[#ffc2d1] transition-colors hover:bg-white/20 pointer-coarse:min-h-11"
        >
          {t.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => dismissToast(t.id)}
        aria-label="Dismiss"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <X size={13} weight="bold" />
      </button>
    </motion.div>
  );
}

export function ToastHost({ offset = 24 }) {
  const list = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ bottom: `calc(${offset}px + env(safe-area-inset-bottom, 0px))`, right: "var(--sheet-offset, 0px)" }}
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------- tabs -- */

export function Tabs({ tabs, value, onChange, className }) {
  const id = useId();
  const ids = tabs.map((t) => t.id);
  return (
    <div role="tablist" className={cx("inline-flex items-center gap-1 rounded-full border border-line bg-sunken p-1", className)}>
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => arrowKeys(e, ids, value, onChange)}
            className={cx(
              "relative rounded-full px-4 py-1.5 text-[13px] whitespace-nowrap transition-colors duration-150 pointer-coarse:min-h-11",
              on ? "font-medium text-ink" : "text-muted hover:text-ink"
            )}
          >
            {on ? (
              <motion.span layoutId={`tab-${id}`} transition={SPRING} className="absolute inset-0 rounded-full bg-surface shadow-soft" />
            ) : null}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- sheet --
   A panel for one short task. From the right on wide screens, from the bottom
   on phones, where it can be dragged down to close (a flick closes it from
   anywhere). Escape and the scrim close it, focus moves in on open and back
   to the opener on close, and the page behind does not scroll.
----------------------------------------------------------------------------- */

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 639px)");
    const apply = () => setNarrow(q.matches);
    apply();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, []);
  return narrow;
}

export function Sheet({ open, onClose, title, children, footer, width = 520, label }) {
  const narrow = useIsNarrow();
  const reduced = useReducedMotion();
  const panelRef = useRef(null);
  const openerRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const panel = panelRef.current;
      const first =
        panel?.querySelector("[data-autofocus]") ||
        panel?.querySelector(
          "input:not([tabindex='-1']):not([inert]):not([type=hidden]), textarea, button:not([data-sheet-close]), [href]"
        );
      (first || panel)?.focus?.();
    }, 60);
    if (!narrow) document.documentElement.style.setProperty("--sheet-offset", `${Math.min(width, window.innerWidth - 24) + 24}px`);
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const nodes = [...panelRef.current.querySelectorAll("a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex='-1'])")];
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.removeProperty("--sheet-offset");
      openerRef.current?.focus?.();
    };
  }, [open, onClose, narrow, width]);

  const onDragEnd = useCallback(
    (_, info) => {
      // Project where the flick would land, then decide: close if it would
      // travel past a third of the sheet, or on any fast downward flick.
      const projected = info.offset.y + (info.velocity.y / 1000) * (0.998 / 0.002) * 0.2;
      if (info.velocity.y > 600 || projected > (panelRef.current?.offsetHeight || 400) / 3) onClose();
    },
    [onClose]
  );

  if (!mounted) return null;

  const from = narrow ? { y: "100%" } : { x: "calc(100% + 24px)" };
  const to = narrow ? { y: 0 } : { x: 0 };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" role="presentation">
          <motion.div
            className="absolute inset-0 bg-[#141414]/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label || (typeof title === "string" ? title : undefined)}
            tabIndex={-1}
            initial={reduced ? { opacity: 0 } : from}
            animate={reduced ? { opacity: 1 } : to}
            exit={reduced ? { opacity: 0 } : from}
            transition={reduced ? FADE : SPRING}
            drag={narrow && !reduced ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.6 }}
            onDragEnd={onDragEnd}
            className={cx(
              "absolute flex flex-col bg-surface shadow-float outline-none",
              narrow
                ? "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[24px] border-t border-line"
                : "bottom-3 right-3 top-3 rounded-[24px] border border-line"
            )}
            style={narrow ? undefined : { width: `min(${width}px, calc(100vw - 24px))` }}
          >
            {narrow ? <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden="true" /> : null}
            <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
              <div className="min-w-0 flex-1">{typeof title === "string" ? <h2 className="font-display text-[21px] leading-snug">{title}</h2> : title}</div>
              <IconButton label="Close" onClick={onClose} data-sheet-close size={34} className="-mr-1.5">
                <X size={16} weight="bold" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">{children}</div>
            {footer ? (
              <div className="shrink-0 border-t border-line px-5 py-3.5 sm:px-6" style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}>
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

/* ------------------------------------------------------------- appear list --
   Children rise into place one after another when they mount, and reflow
   smoothly when the list is filtered or re-ranked.
----------------------------------------------------------------------------- */

export function Appear({ children, index = 0, className, layout = true, as = "div" }) {
  const reduced = useReducedMotion();
  const Tag = motion[as] || motion.div;
  return (
    <Tag
      layout={layout && !reduced ? "position" : false}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
      transition={{ ...SPRING, delay: reduced ? 0 : Math.min(index, 8) * 0.04 }}
      className={className}
    >
      {children}
    </Tag>
  );
}
