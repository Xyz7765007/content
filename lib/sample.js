// Sample signals for screens that need an example before a first search has
// run. Drawn from the site's sample run, so every brand is invented: no real
// company is ever shown with news that did not happen. Always labelled Sample.

import { MARKETS } from "./sample-run";

const daysAgoIso = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export const SAMPLE_SIGNALS = MARKETS[0].signals.map((s, i) => ({
  id: `sample-${i + 1}`,
  headline: s.headline,
  brand: s.brand,
  type: s.type,
  source: s.source,
  url: "",
  summary: "",
  significance: s.why,
  date: daysAgoIso(i),
  sample: true,
}));
