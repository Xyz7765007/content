import { collect } from "./collect";
import { marketMap } from "./market";
import { isMock } from "../ai/client";

const noop = () => {};

// What buyers say in reviews: Trustpilot by domain, Google Maps by place,
// Amazon by product search (ratings everywhere; review text on amazon.com).
export async function reviewsFor({ target = {}, ctx, map = null, sources: want = null }, { user, signal, purse, onStep = noop } = {}) {
  map ||= await marketMap(ctx, { user });
  const country = map.country || ctx?.country || "US";
  const kinds = want || map.reviewSources || [];
  const name = target.name || target.domain || "the market";
  onStep({ id: `reviews:${name}`, label: `Reading reviews of ${name}`, status: "running" });
  const jobs = [];
  if (kinds.includes("trustpilot") && target.domain) jobs.push({ cap: "reviews.trustpilot", params: { domain: target.domain.startsWith("www.") ? target.domain : `www.${target.domain}` } });
  if (kinds.includes("google_maps") && (target.placeQuery || target.name)) jobs.push({ cap: "maps.search", params: { q: target.placeQuery || target.name, country } });
  if (kinds.includes("amazon") && (target.amazonQuery || target.name)) jobs.push({ cap: "amazon.search", params: { q: target.amazonQuery || target.name, country: country.toLowerCase(), limit: 10 } });
  const first = await collect(jobs, { purse, user, signal });
  const products = first.items.filter((x) => x.kind === "product");
  const places = first.items.filter((x) => x.kind === "place");
  const second = [];
  const place = places.find((p) => p.placeId && (!target.name || String(p.name).toLowerCase().includes(String(target.name).toLowerCase().split(" ")[0]))) || places.find((p) => p.placeId);
  if (place) second.push({ cap: "reviews.maps", params: { placeId: place.placeId, limit: 60 } });
  if (country === "US") for (const p of [...products].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).slice(0, 2)) second.push({ cap: "reviews.amazon", params: { asin: p.asin, limit: 40 } });
  const more = second.length ? await collect(second, { purse, user, signal }) : { items: [], sources: [] };
  const reviews = [...first.items, ...more.items].filter((x) => x.kind === "review");
  onStep({ id: `reviews:${name}`, label: `Read ${reviews.length} reviews${products.length ? ` and ${products.length} product listings` : ""}`, status: "done" });
  return { target, reviews, products, places, sources: [...first.sources, ...more.sources], sample: isMock() };
}
