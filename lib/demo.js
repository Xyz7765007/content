// Demo fixture. Open the app with ?demo to land on Select News with sample
// signals already loaded, so the layout can be seen without spending a search.
// Headlines are illustrative and not real news. Safe to delete this file and
// the one line in ContentEngine.jsx that reads it.

export const DEMO_BRAND = {
  brandName: "Voxelised", product: "AI-augmented revenue infrastructure for B2B SaaS",
  brandDescription: "Done-for-you outbound engines that start from real signals, plus productized builds like lead scoring and ABM infrastructure.",
  targetAudience: "Post-PMF B2B SaaS founders and RevOps leads, 50 to 150 people, in ANZ, the UK and India.",
  brandPersona: "Lowercase, contrarian hook, reframe, ends on a question. Specific numbers. No hype.",
  brandValues: "Signal quality over volume, automation with a human gate",
  targetMode: "niche", niche: "B2B SaaS sales and marketing tooling", subNiches: "outbound, AI SDR agents, intent data, GTM engineering",
  selectedSignals: ["product_launch", "market_move", "campaign", "controversy", "collab"],
  selectedPlatforms: ["linkedin", "twitter"],
};

const d = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export const DEMO_NEWS = [
  ["product_launch", "Apollo.io", "Apollo ships an autonomous SDR agent that books meetings without a human in the loop", "The agent researches, writes and sends sequences and handles replies up to the meeting booking. Rolling out to Professional plans first.", "Every outbound agency now has to explain what a human adds above this.", "Google News", "https://techcrunch.com/", 0, 9, true],
  ["market_move", "Clay", "Clay raises a $150M Series C and calls itself a GTM engineering platform", "Led by a growth fund; Clay says revenue tripled year on year and that GTM engineer is now a job title at 400 companies.", "The category you sell into just got a name and a budget line.", "Google News", "https://www.theinformation.com/", 0, 9, true],
  ["controversy", "Apollo.io", "Apollo criticised for auto-enrolling users into an AI auto-reply beta that answered prospects unprompted", "Several users say the assistant replied to inbound threads without approval; Apollo paused the beta.", "Autonomy without an approval gate just embarrassed a market leader. Gated AI is a selling point today.", "Twitter / X", "https://x.com/", 0, 8, true],
  ["controversy", "Instantly.ai", "Instantly hit with deliverability complaints after a shared IP pool lands on a major blocklist", "Users on Reddit and X report open rates halving overnight; the company says a subset of pools is affected.", "Every cold-email buyer is nervous today. Infrastructure beats volume is the post.", "Reddit", "https://www.reddit.com/", 1, 8, true],
  ["collab", "LinkedIn", "LinkedIn opens the Sales Navigator API to approved partners for signal export", "Job-change, headcount and post-engagement signals available to partner apps under a new programme.", "First-party LinkedIn signals via API changes what a signal engine can be.", "LinkedIn", "https://www.linkedin.com/", 1, 8, true],
  ["market_move", "Gartner", "Gartner predicts 60% of B2B sales orgs will move to AI-first prospecting by 2027", "New research note; also warns that signal quality, not model quality, decides outcomes.", "Quote that line. It is your entire positioning in a source your prospects trust.", "Google News", "https://www.gartner.com/", 2, 7, true],
  ["market_move", "Google", "Google adds AI Mode business results, cutting organic clicks for B2B SaaS sites", "Early data shows 15 to 30% declines in informational traffic for software categories.", "If inbound is dying for your prospects, outbound signal work is the hedge.", "Google News", "https://searchengineland.com/", 1, 8, false],
  ["market_move", "Salesforce", "Salesforce moves Agentforce to per-conversation pricing after customer pushback", "The $2 per conversation model replaces flat per-seat fees; analysts call it a response to slow adoption.", "Usage-based AI pricing is becoming the norm. Retainers priced on outcomes look sane next to this.", "Google News", "https://www.reuters.com/", 1, 7, true],
  ["campaign", "Artisan", "Artisan stop hiring humans campaign draws backlash from sales leaders on LinkedIn", "The AI SDR startup billboards trend for the wrong reasons; the CEO defends them as intentionally provocative.", "Anti-human framing is losing the room. AI-augmented positioning has never had an easier contrast.", "LinkedIn", "https://www.adweek.com/", 3, 7, true],
  ["product_launch", "HubSpot", "HubSpot launches Breeze Prospecting Agent for small teams", "Included in Sales Hub Professional; drafts personalised outreach from CRM context and web research.", "SMBs get a near-free SDR agent inside the CRM they already pay for. Your ICP floor just moved up.", "Google News", "https://www.hubspot.com/", 1, 6, true],
  ["campaign", "Lemlist", "Lemlist runs a kill the sequence billboard campaign across London Underground stations", "Ads mock 12-step drip sequences; the CTA drives to a manifesto page and a free sequence audit.", "A tool vendor is attacking the very tactic your prospects overuse. Ride the argument.", "Instagram", "https://www.thedrum.com/", 2, 5, true],
  ["collab", "Smartlead", "Smartlead partners with Clay for one-click list to campaign handoff", "Enriched Clay tables push directly into Smartlead campaigns with mailbox rotation preset.", "Your own stack just got easier to sell. Show the workflow, not the logos.", "LinkedIn", "https://www.smartlead.ai/", 3, 4, true],
  ["market_move", "ZoomInfo", "ZoomInfo cuts 8% of staff, citing AI efficiency", "Third reduction in two years. Leadership says Copilot usage is up 3x while sales support headcount falls.", "Data vendors are shrinking their own sales teams. The strongest argument for automation you will get this week.", "Google News", "https://www.bloomberg.com/", 4, 5, true],
  ["product_launch", "Attio", "Attio ships Agents inside the CRM and a $0 tier for startups under 10 people", "Agents run enrichment, follow-ups and pipeline hygiene; the free tier is uncapped on records.", "Free CRM plus free agents at the bottom of the market. Move up-market or explain why you are better than free.", "Google News", "https://attio.com/", 5, 3, null],
].map(([type, brand, headline, summary, significance, source, url, daysAgo, hot, verified], i) => ({
  id: `demo${i}`, type, brand, headline, summary, significance, source, url, domain: url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""),
  date: d(daysAgo), hot, verified, selected: false,
}));
