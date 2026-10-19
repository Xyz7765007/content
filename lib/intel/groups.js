// How measured groups are shown to a model: compact rows, one rounding rule,
// and small groups marked as early signs. Shared by Ask, the reports and the
// briefing so every surface describes a pattern the same way.

export const pct = (n) => (n == null ? null : Math.round(n * 1000) / 10);
// One rounding rule for every multiple shown: one decimal place.
export const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// A group seen in fewer than five accounts is an early sign, not a pattern;
// under three it's left out unless nothing bigger exists. Groups are ranked
// by a score that pulls small groups towards typical, so a lucky trio never
// outranks a pattern seen across twenty accounts.
export const EARLY_BELOW = 5;
export const solid = (groups, take) => {
  const list = (groups || []).filter((g) => g.key !== "other");
  const big = list.filter((g) => (g.authors ?? g.n) >= 3);
  return (big.length ? big : list)
    .map((g) => ((g.authors ?? g.n) < EARLY_BELOW ? { ...g, early: true } : g))
    .sort((x, y) => (y.score ?? y.medianStrength ?? 0) - (x.score ?? x.medianStrength ?? 0))
    .slice(0, take);
};

export const groupRow = (g, name) => ({
  [name]: g.key,
  posts: g.n,
  accounts: g.authors ?? null,
  reach: r1(g.medianStrength),
  ...(g.medianEr != null ? { engagementPct: pct(g.medianEr) } : {}),
  ...(g.consistency != null ? { accountsBeatingNormPct: Math.round(g.consistency * 100) } : {}),
  ...(g.early ? { earlySign: true } : {}),
});

// What a piece of work read, grouped by source, for "What I read" lines.
export function readSummary(sources = []) {
  const by = new Map();
  for (const s of sources) {
    if (!s || s.skipped) continue;
    const key = s.label;
    if (!by.has(key)) by.set(key, { label: key, items: 0, calls: 0, failed: 0 });
    const b = by.get(key);
    b.items += s.n || 0;
    b.calls += s.calls || 0;
    if (s.error) b.failed += 1;
  }
  return [...by.values()].filter((b) => b.items || b.failed).sort((a, b) => b.items - a.items);
}
