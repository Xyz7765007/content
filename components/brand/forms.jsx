"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plus, Sparkle, X } from "@phosphor-icons/react";
import { Button, Card, Chip, Field, Input, SPRING, Segmented, Textarea, cx, toast } from "../ui";
import Huesy from "../huesy/Huesy";
import { PLATFORMS, DEFAULT_CREATIVE_DIRECTION } from "../../lib/constants";
import { resizeImg } from "../../lib/parse";
import { quickJob, slimBrand } from "../../lib/api";

/* ------------------------------------------------------------- image grid -- */

export function ImageGrid({ images, setImages, count, label }) {
  const upload = (i, file) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const resized = await resizeImg(ev.target.result);
      const next = [...images];
      next[i] = resized;
      setImages(next);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => {
        const src = images?.[i];
        return (
          <div
            key={i}
            className={cx(
              "relative aspect-square overflow-hidden rounded-xl border",
              src ? "border-accent-line" : "border-dashed border-line-strong bg-sunken"
            )}
          >
            {src ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${label} ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    const next = [...images];
                    next[i] = null;
                    setImages(next);
                  }}
                  aria-label={`Remove ${label} ${i + 1}`}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#141414]/75 text-white backdrop-blur-sm transition-opacity hover:bg-[#141414]"
                >
                  <X size={12} weight="bold" />
                </button>
              </>
            ) : (
              <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1.5 text-faint transition-colors hover:text-muted">
                <Plus size={18} />
                <span className="text-[11px]">
                  {label} {i + 1}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => e.target.files?.[0] && upload(i, e.target.files[0])}
                />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- brand info -- */

const BRAND_FIELDS = [
  { key: "brandName", label: "Brand name" },
  { key: "product", label: "Product" },
  { key: "brandDescription", label: "What the brand does" },
  { key: "targetAudience", label: "Audience" },
  { key: "brandPersona", label: "Voice" },
  { key: "brandValues", label: "Values" },
];

export function BrandInfoForm({ brand, setBrand }) {
  const [tidying, setTidying] = useState(false);
  const [proposal, setProposal] = useState(null);

  const tidy = async () => {
    setTidying(true);
    const r = await quickJob("tidy", slimBrand(brand));
    setTidying(false);
    if (r.error) return toast(r.error.message, { duration: 5000 });
    const changed = BRAND_FIELDS.filter(({ key }) => (r.data?.[key] || "").trim() && (r.data[key] || "").trim() !== (brand[key] || "").trim());
    if (!changed.length) return toast("It already reads well. Nothing to change.");
    setProposal(r.data);
  };

  const accept = () => {
    const before = Object.fromEntries(BRAND_FIELDS.map(({ key }) => [key, brand[key] || ""]));
    const after = Object.fromEntries(BRAND_FIELDS.map(({ key }) => [key, (proposal[key] || "").trim() || brand[key] || ""]));
    setBrand(after);
    setProposal(null);
    toast("Brief tidied", { tone: "good", action: { label: "Undo", onClick: () => setBrand(before) } });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Brand name" required htmlFor="brandName" hint="As it's written in posts.">
          <Input id="brandName" value={brand.brandName} onChange={(e) => setBrand({ brandName: e.target.value })} placeholder="Honest Glow" />
        </Field>
        <Field label="Product" htmlFor="product" hint="What you sell, in a few words.">
          <Input id="product" value={brand.product} onChange={(e) => setBrand({ product: e.target.value })} placeholder="Refillable skincare" />
        </Field>
      </div>

      <Field label="What the brand does" htmlFor="brandDescription" hint="A short paragraph. It goes into every post.">
        <Textarea
          id="brandDescription"
          rows={3}
          value={brand.brandDescription}
          onChange={(e) => setBrand({ brandDescription: e.target.value })}
          placeholder="Minimal skincare sold direct, built around a small range and a founder who answers comments."
        />
      </Field>

      <Field label="Audience" htmlFor="targetAudience" hint="Who buys, as specifically as you can.">
        <Textarea
          id="targetAudience"
          rows={2}
          value={brand.targetAudience}
          onChange={(e) => setBrand({ targetAudience: e.target.value })}
          placeholder="Women 22 to 35 in cities, who buy on Instagram and follow founders more than brands."
        />
      </Field>

      <Field label="Voice" htmlFor="brandPersona" hint="How the brand sounds. An example line helps most.">
        <Textarea
          id="brandPersona"
          rows={3}
          value={brand.brandPersona}
          onChange={(e) => setBrand({ brandPersona: e.target.value })}
          placeholder={'Warm and plain spoken. Short sentences, never hypey. "Three products. That\'s the routine."'}
        />
      </Field>

      <Field label="Values" htmlFor="brandValues" hint="Optional.">
        <Input id="brandValues" value={brand.brandValues} onChange={(e) => setBrand({ brandValues: e.target.value })} placeholder="Refill first, honest claims" />
      </Field>

      <AnimatePresence initial={false}>
        {proposal ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={SPRING}
            className="rounded-[20px] border border-accent-line bg-accent-soft/50 p-4 sm:p-5"
          >
            <div className="flex items-center gap-2.5">
              <Huesy mood="idle" size={30} track={false} />
              <p className="text-[14px] font-medium text-ink">Here's a tidier version. Nothing changes until you accept.</p>
            </div>
            <dl className="mt-4 flex flex-col gap-3">
              {BRAND_FIELDS.filter(({ key }) => (proposal[key] || "").trim() && (proposal[key] || "").trim() !== (brand[key] || "").trim()).map(({ key, label }) => (
                <div key={key} className="rounded-xl border border-line bg-surface p-3">
                  <dt className="meta">{label}</dt>
                  {brand[key] ? <dd className="mt-1 text-[13px] text-faint line-through decoration-faint/60">{brand[key]}</dd> : null}
                  <dd className="mt-1 text-[14px] text-ink">{proposal[key]}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={accept}>
                <Check size={14} weight="bold" />
                Use this
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
                Keep mine
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!proposal ? (
        <div>
          <Button variant="quiet" onClick={tidy} disabled={tidying || !brand.brandName?.trim()} loading={tidying}>
            {!tidying ? <Sparkle size={15} weight="fill" className="text-accent-deep" /> : null}
            {tidying ? "Tidying" : "Tidy with AI"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------- platform personality -- */

const TONES = ["Warm", "Expert", "Witty", "Bold", "Playful", "Plain spoken"];

export function PlatformPersonalityForm({ brand, setBrand }) {
  const active = brand.activePlatforms || [];

  const toggle = (id) =>
    setBrand((d) => {
      const current = d.activePlatforms || [];
      return { ...d, activePlatforms: current.includes(id) ? current.filter((p) => p !== id) : [...current, id] };
    });

  const setTone = (id, value) =>
    setBrand((d) => ({ ...d, platformPersonality: { ...d.platformPersonality, [id]: value } }));

  return (
    <div className="flex flex-col gap-6">
      <Field label="Where do you post?" hint="Only these show up when you write, and each gets its own tone.">
        <div className="mt-1 grid gap-2.5 sm:grid-cols-2">
          {PLATFORMS.map((p) => {
            const on = active.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={on}
                className={cx(
                  "rounded-[18px] border p-4 text-left transition-[transform,border-color,background-color] active:scale-[0.99]",
                  on ? "border-ink bg-raised" : "border-line bg-surface hover:border-line-strong"
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{p.label}</span>
                  <span
                    className={cx(
                      "flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border transition-colors",
                      on ? "border-ink bg-ink text-canvas" : "border-line-strong"
                    )}
                  >
                    {on ? <Check size={12} weight="bold" /> : null}
                  </span>
                </span>
                <span className="mt-1 block text-[13px] text-muted">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </Field>

      {active.length ? (
        <div className="flex flex-col gap-5 border-t border-line pt-6">
          <p className="text-sm text-muted">
            The same news shouldn't read the same everywhere. Pick a tone, add your own words, or leave it and the
            brand voice is used.
          </p>
          {PLATFORMS.filter((p) => active.includes(p.id)).map((p) => {
            const value = brand.platformPersonality?.[p.id] || "";
            return (
              <Field key={p.id} label={p.label} htmlFor={`pp-${p.id}`}>
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map((t) => {
                    const on = value.toLowerCase().includes(t.toLowerCase());
                    return (
                      <Chip
                        key={t}
                        selected={on}
                        onClick={() =>
                          setTone(
                            p.id,
                            on
                              ? value.replace(new RegExp(`\\b${t}\\b[,.]?\\s*`, "i"), "").trim()
                              : [value.trim(), t].filter(Boolean).join(value.trim() ? ", " : "")
                          )
                        }
                        className="px-3 py-1 text-[12.5px]"
                      >
                        {t}
                      </Chip>
                    );
                  })}
                </div>
                <Textarea
                  id={`pp-${p.id}`}
                  rows={2}
                  value={value}
                  onChange={(e) => setTone(p.id, e.target.value)}
                  placeholder={`How the brand sounds on ${p.label}`}
                />
              </Field>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- references -- */

export function ReferencesForm({ brand, setBrand }) {
  const active = brand.activePlatforms || [];
  const chosen = PLATFORMS.filter((p) => active.includes(p.id));

  if (!chosen.length) {
    return <p className="text-sm text-muted">Choose where you post first, then add examples for each place here.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Optional, and the biggest lever on quality: show Huesy posts that sound right, and the drafts match their
        rhythm. Reference images stay on this device.
      </p>
      {active.includes("instagram") ? (
        <Card className="p-5">
          <Field label="Instagram posts you like" hint="Up to four screenshots. They're read when the caption and brief are written.">
            <ImageGrid
              images={brand.instaRefImages || [null, null, null, null]}
              setImages={(v) => setBrand({ instaRefImages: v })}
              count={4}
              label="Post"
            />
          </Field>
        </Card>
      ) : null}

      {chosen
        .filter((p) => p.id !== "instagram")
        .map((p) => (
          <Card key={p.id} className="p-5">
            <Field label={`${p.label} posts that sound right`} hint="Paste up to four.">
              <div className="flex flex-col gap-2.5">
                {[0, 1, 2, 3].map((i) => (
                  <Textarea
                    key={i}
                    rows={2}
                    value={brand.referencePosts?.[p.id]?.[i] || ""}
                    onChange={(e) => {
                      const refs = { ...(brand.referencePosts || {}) };
                      refs[p.id] = [...(refs[p.id] || [])];
                      refs[p.id][i] = e.target.value;
                      setBrand({ referencePosts: refs });
                    }}
                    placeholder={`Example ${i + 1}`}
                    aria-label={`${p.label} example ${i + 1}`}
                  />
                ))}
              </div>
            </Field>
          </Card>
        ))}

      {active.includes("instagram") ? (
        <>
          <Field label="Creative direction" hint="For image briefs when no reference creative is uploaded. Leave it empty for Huesy's editorial default.">
            <Textarea
              rows={4}
              value={brand.creativeDirection === DEFAULT_CREATIVE_DIRECTION ? "" : brand.creativeDirection || ""}
              onChange={(e) => setBrand({ creativeDirection: e.target.value })}
              placeholder={DEFAULT_CREATIVE_DIRECTION}
            />
          </Field>

          <Card className="p-5">
            <Field label="Reference creatives" hint="Uploading these overrides the written creative direction.">
              <ImageGrid
                images={brand.refCreativeImages || [null, null, null]}
                setImages={(v) => setBrand({ refCreativeImages: v })}
                count={3}
                label="Creative"
              />
            </Field>
          </Card>
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- targets -- */

const brandsIn = (text) =>
  String(text || "")
    .split(/\n|,/)
    .map((a) => a.trim())
    .filter(Boolean);

export function TargetsForm({ targets, setTargets }) {
  const mode = targets.targetMode || "niche";

  return (
    <div className="flex flex-col gap-5">
      <Segmented
        label="What to watch"
        value={mode}
        onChange={(v) => setTargets({ targetMode: v })}
        options={[
          { id: "niche", label: "A market" },
          { id: "accounts", label: "Specific brands" },
        ]}
      />

      {mode === "niche" ? (
        <>
          <Field label="Market" required htmlFor="niche">
            <Input id="niche" value={targets.niche || ""} onChange={(e) => setTargets({ niche: e.target.value })} placeholder="Beauty and skincare" />
          </Field>
          <Field label="Narrow it down" htmlFor="subNiches" hint="Optional. Comma separated.">
            <Input
              id="subNiches"
              value={targets.subNiches || ""}
              onChange={(e) => setTargets({ subNiches: e.target.value })}
              placeholder="Clean beauty, refills, founder led brands"
            />
          </Field>
        </>
      ) : (
        <Field label="Brands to watch" required htmlFor="accountList" hint="One per line, or separated by commas.">
          <Textarea
            id="accountList"
            rows={6}
            value={targets.accountList || ""}
            onChange={(e) => setTargets({ accountList: e.target.value })}
            placeholder={"Glossier\nSummer Fridays\nLaneige"}
          />
        </Field>
      )}
      {mode === "niche" && brandsIn(targets.accountList).length ? (
        <p className="text-[12.5px] text-muted">
          Also keeping an eye on: {brandsIn(targets.accountList).slice(0, 8).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
