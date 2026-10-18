# Huesy

Know what's working in your market, and make content built on it.

Huesy reads real posts across Instagram, TikTok, YouTube, LinkedIn and X to answer anything about a
brand's market: what's rising, which openings and formats win, how competitors post, what the audience
asks, and which creators fit. Everything it learns is kept, and Studio turns it into creatives,
carousels, posts and reels that follow a measured pattern and show their proof. Watchlists still bring
back brand launches and collabs worth posting about.

Two plans (`lib/plans.js`):

| | Intelligence, $47 | Studio, $97 |
|---|---|---|
| Credits a month | 20,000 | 20,000 |
| Ask, deep reports, creators, watchlists, weekly briefing | yes | yes |
| Creatives and carousels | | 10 and 10 a month |
| Reels, made by the owner within 24 hours | | 3 a month |
| Captions, posts, threads, newsletters | | as many as needed (30 a day) |
| Seats | open | 100 (`NEXT_PUBLIC_TIER2_SEATS`) |

Credits: a question 100, a deep report 600 (the first is free), a creator search 900, a watchlist check
400, a creator contact 20. Anything that fails, finds nothing, or is stopped before it delivers gives the
credits back. Plans are switched on by the owner from `/admin` (people request one on `/plans`); payments
come later.

Live: https://content-engine-two-pink.vercel.app

## What it is made of

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router, React 19 |
| Styling | Tailwind v4 with a token layer in `app/globals.css` |
| State | Zustand, persisted to `localStorage`, mirrored to Supabase per account |
| Backend | Supabase: auth, `user_state`, `waitlist`, `contact_messages`, `ai_usage`, `site_events` |
| AI | Anthropic SDK. Search and writing on Claude Sonnet 5.5, small jobs and ranking on Claude Haiku 5.5 |
| Creatives | Nano Banana Pro (Gemini 3 Pro Image), from the browser with the person's own key |
| Motion | Motion (Framer Motion) springs |
| Icons | Phosphor, one family everywhere |

## The website is a waitlist

`/` is a waitlist page: every call to action joins the list, and nothing on it sends a visitor into the
product. It has the join form in the first screen, a sample run that shows the product working in seven
seconds without any AI call (every brand in it is invented and labelled Sample), why Huesy exists, what
happens when a place opens, questions, and the form again at the end. `/privacy` says what is stored.

- **Joins** go to `POST /api/waitlist` and land in Supabase `waitlist` (email, where on the page, campaign
  tags, referrer). The reply carries a one time `edit_token`, which is the only way to add the optional
  answer to "What should Huesy watch for you?" (`PATCH /api/waitlist`). A repeat join answers `already`
  and no token, so knowing someone's address never lets anyone change their row. A hidden field catches
  bots. No confirmation email is sent, so the success state echoes the address back with "Change it".
- **Counts** go to `POST /api/event` and `site_events`: views, form focus, joins, answers, sample runs,
  with the part of the page they happened on. No IP address, user agent or cookie.

Useful queries in the Supabase SQL editor:

```sql
select source, count(*) from waitlist group by 1 order by 2 desc;          -- where joins come from
select watch, count(*) from waitlist where watch is not null group by 1;   -- what people want watched
select name, source, count(*) from site_events group by 1, 2 order by 3 desc;
```

### Who gets into the app

While `HUESY_ACCESS` is `waitlist` (the default), only accounts with early access use the app:

- Early access is the addresses in `HUESY_EARLY_ACCESS` (comma separated emails or `@domain` rules),
  plus the QA account. To invite someone: add their email there, redeploy, and send them `/signup`.
- Everyone else who signs up lands on `/waitlist` ("You're on the list") and is added to the waitlist.
- The middleware keeps the app and brand setup closed to them, and every AI route checks again on the
  server (`lib/ai/access.js`), so nobody outside the list can spend credit.

**Opening up later:** set `HUESY_ACCESS=open` (the app) and `NEXT_PUBLIC_HUESY_SITE=open` (the site's
wording), then redeploy.

## Screens

| Route | What it is |
|---|---|
| `/` | Waitlist site: hero form, sample run, why, how, questions, final form |
| `/privacy`, `/contact` | What is stored and how to delete it; the contact form |
| `/login`, `/signup` | Email accounts. Google appears only when `NEXT_PUBLIC_GOOGLE_AUTH=on` |
| `/waitlist` | Where a signed in account without early access lands |
| `/onboarding` | A name and one sentence; Huesy drafts the rest, including the market and competitors. Finishing spends nothing |
| `/plans` | The two plans, seats left, and the plan request |
| `/home` (Today) | Plan state, the free first playbook, the weekly briefing, where you left off, quick actions, then watchlist signals |
| `/ask` | Conversations with the analyst: live steps, the answer, the posts behind it, a priced deep report when needed, and Make from this |
| `/insights` | Deep reports (`/insights/reports/[id]`), What I know (`/insights/knowledge`), Creators (`/insights/creators`), plus Watchlists and Saved |
| `/studio` | What's left this month, the four makers, reels, the Library |
| `/studio/creative`, `/studio/carousel`, `/studio/text`, `/studio/reel` | Each maker: evidence and proof first, then ideas, then the editor (`?id=` reopens one; `?from=` and `?topic=` start from a finding or a report idea) |
| `/admin` | Owner only (`ADMIN_EMAILS`): plan requests, the reel queue (brief, start, upload, deliver), accounts, credits, hit rate, spend |
| `/search` (Watchlists) | Watchlists, when each was last checked, Check now |
| `/search/new` | The watchlist builder (`?edit=<id>` edits one) |
| `/search/[id]` | One watchlist: the live run, ranked signals, select several to write |
| `/compose` | Writing for several signals at once (up to ten) |
| `/saved` | Everything saved, in boards |
| `/profile` (Brand) | Brand, platforms and tone, examples, what to watch, account |

### How the product behaves

- **Huesy** (`components/huesy/Huesy.jsx`) is the one signature element: a small blob in the two brand
  colours with eyes that follow the pointer. Its mood says what is happening: `watch` while a search
  runs, `found`, `write`, `sleepy` when there is nothing yet, `oops` on errors. It speaks in the first
  person only in those moments.
- **Searches run in the background** (`lib/runner.js`). They stream: the searches it runs, the sites it
  reads and each signal as soon as it is written. Moving around the app never cancels one; a toast says
  when it is done. Signals from a run that stopped early are kept. A failed or empty run never saves a
  signal.
- **Every signal is ranked** for the brand (fit 1 to 5) with the angle for that brand, and the list sorts
  best fit first.
- **Writing** (`lib/writer.js`) also runs in the background, three posts at a time. "Write a post" opens
  the signal and starts writing at once for the platforms the brand publishes on. Every post is kept
  under its signal (`drafts`), edits save as they are typed, and every Refine can be undone.
- **One way to keep things**: Save. It goes to a board (Unsorted by default) and can be moved.
- **Undo, not confirmation dialogs**, for deleting watchlists, boards and saves.
- **Light and dark** follow the system, with a switch in the sidebar and on Brand.
- **Credits are shown before they're spent**: every paid button carries its price, the meter in the
  sidebar (a pill on phones) moves the moment a response reports the new balance, and refusals name the
  one next step (`GateNote` in `components/plan/PlanBits.jsx`).
- **Content starts from evidence.** Every Studio piece first runs grounding (`lib/studio/ground.js`):
  it checks what Huesy already knows for that platform and format, researches only what's missing or old,
  and shows a proof score (Strong, Good, Thin) with the posts behind it.
- Motion is one critically damped spring (`SPRING` in `components/ui.jsx`), feedback on pointer-down,
  and reduced motion swaps movement for cross fades.

## AI: models and cost

All calls go through `lib/ai/` on the server. The browser sends structured inputs (a platform, a
signal, the brand); the server builds the prompt (`lib/prompts.js`) and picks the model by job
(`lib/ai/models.js`), so a client can never send a raw prompt or choose a pricier model.

| Job | Model | Effort | Rough cost |
|---|---|---|---|
| Search (web search, up to 4 + 3 per platform) | Sonnet 5.5 | medium | $0.20 to $0.40 a search |
| Ranking the results for the brand | Haiku 5.5 | low | about $0.002 a search |
| Writing a post | Sonnet 5.5 | low | $0.005 to $0.03 a post |
| Refine a post | Sonnet 5.5 | low | under $0.02 |
| Draft a brand, tidy a brief, suggest an instruction | Haiku 5.5 | low | under $0.002 |

What changed from v1, which wrote with Opus 4.6 and searched with Sonnet 4.6:

- Writing moved from Opus 4.6 ($5/$25 per million tokens) to Sonnet 5.5 ($2/$10).
- Instagram is one call instead of three, and the reference images and brand block are cached, so the
  images are paid for once per run instead of three times per signal.
- Search uses `web_search_20260209`, which filters results before they reach the model, and asks for
  ISO dates and a signal type per item. It has room for a full list (16,000 tokens against v1's 4,096,
  which cut lists short).
- The small jobs moved to Haiku 5.5, about twenty times cheaper than Sonnet.
- Sonnet calls carry the server side fallback (`fallbacks: "default"`), so a rare decline is retried on
  Sonnet 5 instead of failing.

**Jev (TypeSafe) was considered and left out.** The only typed decision in Huesy is ranking. Haiku does
it for about $0.002 a search and also writes the angle line; Jev would save about $0.0015 a search,
could not write the angle, and would need its own TypeSafe key.

**Guards on spend:** every call is written to `ai_usage` with its tokens and estimated dollars, and each
account has a daily allowance (`HUESY_DAILY_USD_CAP`, default $3) checked before each call. A search
that the server pauses only carries on while it has spent less than `HUESY_SEARCH_USD_CAP` (default
$0.60), and keeps what it found so far.

```sql
select date_trunc('day', created_at) as day, kind, count(*), round(sum(usd), 3) as usd
from ai_usage where not mock group by 1, 2 order by 1 desc, 4 desc;
```

## Intelligence and Studio

- **Data** (`lib/intel/`): one client for the data API (`source.js`, budgets and timeouts on every call,
  a shared cache of public data in `data_cache`), normalisers to one post shape, stats computed by code
  (reach against the account's own normal and against the format's typical post), tags by Haiku, and
  **findings**: facts with their sample size, age and evidence, saved per account. Nothing measured is
  ever invented by a model.
- **Ask** (`lib/intel/agent.js`): Sonnet with tools. It recalls what's known first, makes at most six data
  calls, and proposes a deep report when a question needs more. Groups of fewer than three posts are
  never presented as patterns.
- **Reports** (`lib/intel/reports.js`): fixed data plans, written up into a fixed shape with five ideas.
  A report that finds nothing is free.
- **Weekly briefing** (`lib/intel/briefing.js`): built from this week's measured posts without a model.
- **Studio** (`lib/studio/`): grounding, writers (`write.js`), pictures (`images.js`), pieces
  (`items.js`, deleting a counted piece hides it so it still counts), reels (`reels.js`), and exports in
  the browser (`exporter.js`: PNG, a zip of slides, a PDF).
- **Reels** are made by the owner. The queue is on `/admin`; the private OS has a `huesy-reels` skill
  that claims the next request into a work folder and delivers the video. A reel counts as working at
  1,500 views in its first week; customers track it on the reel's page.

## The stand-in model and QA

`HUESY_AI_MOCK=1` swaps every model, data and picture call for stand-ins (`lib/ai/mock.js`,
`lib/intel/mock.js`, the sample pictures in `lib/studio/images.js`): the same shapes, realistic timing,
no network, no spend, and nothing written to the shared data cache. Results are marked Sample. Typed
into a watchlist's market or a search word, `#empty` returns nothing, `#fail` fails and `#slow` takes
longer; `#slow` in a question holds the answer back a few seconds.

```bash
npm run build
HUESY_AI_MOCK=1 npx next start -p 4311
# in another shell
PHASE=fresh BASE=http://localhost:4311 QA_PASSWORD=... node scripts/qa/qa-app.mjs   # first run to sign out, 36 checks
PHASE=phone BASE=http://localhost:4311 QA_PASSWORD=... node scripts/qa/qa-app.mjs   # 390px phone, 7 checks
BASE=http://localhost:4311 SB_URL=... SB_KEY=... node scripts/qa/qa-site-api.mjs     # waitlist, events, gate, 31 checks
# v4: start the server with ADMIN_EMAILS=qa.huesy@example.com as well
BASE=... QA_PASSWORD=... SB_URL=... SB_KEY=... node scripts/qa/qa-v4-api.mjs   # credits, refunds, allowances, reels, admin, stress: 96 checks
BASE=... QA_PASSWORD=... SB_URL=... SB_KEY=... node scripts/qa/qa-v4-ui.mjs    # every flow in a browser, downloads, locks, phone (PHASE= one part)
```

Both v4 suites reset the QA account to a fresh Studio month first. `scripts/admin/set-plan.mjs` sets
anyone's plan from the command line.

`qa-app.mjs` signs in as the QA account (`QA_EMAIL`, default `qa.huesy@example.com`). `PHASE=fresh`
expects that account to have no saved state (delete its `user_state` row first); `PHASE=migrate`
expects an old version 4 copy and checks it is upgraded. `qa-site-api.mjs` writes test rows with `qa+huesy-…`
addresses and a throwaway account, and deletes them at the end.

Local runs write to the same Supabase project as production. Every page the scripts open carries
`utm_source=qa-site`, and `qa-site-api.mjs` deletes only the events with that tag, so real visits are
never touched. After `qa-a11y.mjs`, clear its events with
`delete from site_events where utm->>'utm_source' = 'qa-site';`. QA leaves `ai_usage` rows marked
`mock`, which `delete from ai_usage where mock;` removes.

`probe-real.mjs` is the one script that spends money: one pass of every request shape on the real
models (about $0.22), read back from `ai_usage`. Run it against a local server that has the key.

## Backend on Supabase

- **Auth.** Email and password; Google once switched on. Sessions refresh in `middleware.js`, which only
  runs Supabase for app and account pages, never for the public site.
- **`user_state`**: one row per account with the whole app state as JSON (`STATE_VERSION` 6). The copy
  in a browser belongs to one account (`ownerId`): setup done before signing up is adopted by the first
  account, never handed to a second one, and signing out clears it. Older copies are migrated on load
  (`migrateState` in `lib/store.js`).
- **`waitlist`, `contact_messages`, `ai_usage`, `site_events`** have no policies at all: only the server
  writes them, with the secret key.

Schema is in `supabase/schema.sql` (additive; safe to re-run). Apply it with:

```bash
SUPABASE_DB_PASSWORD=... node scripts/db-migrate.js
```

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | For AI | Search, ranking and writing. Without it those steps say writing isn't switched on yet |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project settings, API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | The publishable key. Safe in the browser |
| `SUPABASE_SECRET_KEY` | Yes | Server only. Waitlist, contact, ledger, events |
| `HUESY_ACCESS` | Optional | `waitlist` (default) or `open` |
| `HUESY_EARLY_ACCESS` | Optional | Extra early access emails or `@domain` rules, comma separated |
| `NEXT_PUBLIC_HUESY_SITE` | Optional | `waitlist` (default) or `open`, the site's wording |
| `HUESY_DAILY_USD_CAP` | Optional | Per account daily AI allowance in dollars, default 3 |
| `HUESY_SEARCH_USD_CAP` | Optional | The most one search may spend before it stops continuing, default 0.6 |
| `HUESY_AI_MOCK` | QA only | `1` uses the stand-in model. Never set it in production |
| `HUESY_DATA_TOKEN`, `HUESY_DATA_ORG` | For intelligence | The data API's token and organisation. Without them, asking and research say they can't read platforms |
| `HUESY_DATA_BASE` | Optional | The data API's address |
| `HIGGSFIELD_CREDENTIALS` | For AI pictures | `key_id:key_secret`. Without it, creatives use the person's photo or words and colour |
| `JEV_API_KEY`, `JEV_API_BASE` | Optional | A cheaper post tagger; Haiku tags posts without them |
| `ADMIN_EMAILS` | For `/admin` | Comma separated owner emails |
| `NEXT_PUBLIC_TIER2_SEATS` | Optional | Studio seats, default 100 |
| `NEXT_PUBLIC_GOOGLE_AUTH` | Optional | `on` shows Google sign in, once the provider is set up in Supabase |
| `NEXT_PUBLIC_SITE_URL` | Optional | For link previews, default the vercel.app address |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Optional | Shown on the contact page |
| `GOOGLE_AI_API_KEY` | Optional | Server side image route (unused by the screens today) |

## Deploy

The Vercel project is `content-engine` on the alt account. From a copy of the repo without
`node_modules`, `.next` and `.git`:

```bash
npx vercel deploy --yes --prod --scope xyzs-projects-03235428
```

## Project structure

```
app/
  page.jsx                  the waitlist site
  privacy/ contact/         site pages
  login/ signup/ forgot-password/ reset-password/ waitlist/
  auth/callback/            code exchange for confirmation and recovery links
  onboarding/ home/ search/ compose/ saved/ profile/
  plans/ ask/ insights/ studio/ admin/
  api/                      ai, ai-search, waitlist, event, contact, generate-image, airtable,
                            account, admin, intel/*, studio/*
  icon.svg apple-icon.jsx opengraph-image.jsx
middleware.js               session refresh, app gate, waitlist redirect
components/
  ui.jsx                    buttons, fields, sheet, toast, segmented, tabs, states
  huesy/Huesy.jsx           the character
  site/                     Landing, JoinForm, JoinSheet, SampleRun, SiteChrome
  shell/                    AppShell, Wordmark
  auth/                     AuthShell, useSession, LogoutButton, StateSync
  signals/                  SignalCard, SignalSheet, RunPanel, SignalToolbar, BoardPicker, RegionPicker
  compose/PostCard.jsx      a written post: edit in place, copy, refine, save
  brand/forms.jsx           brand, tone, examples, targets
  brand/IntelForm.jsx       the market: platforms, region, search words, competitors, goal
  plan/ ask/ insights/ studio/ today/ intel/   the v4 screens' parts
  Markdown.jsx              the safe markdown answers are shown in
lib/
  ai/                       models, client, access, usage, errors, run, mock
  plans.js account.js       plans and prices; the account store the screens share
  billing/                  credits, allowances, the plan guard (server)
  intel/                    data, stats, findings, the Ask agent, reports, briefing
  studio/                   grounding, writers, pictures, pieces, reels, options, exports
  reportRunner.js stream.js background reports; the streaming reader
  prompts.js                every prompt and the search parser
  runner.js writer.js       background searches and writing
  store.js                  persisted state, migrations, owner
  access-rules.js           who gets in
  site.js sample-run.js     site helpers and the sample run's content
  parse.js constants.js api.js
supabase/schema.sql         tables, policies, trigger
scripts/                    db-migrate.js, supabase-auth-config.js, qa/
```

## Notes for the next change

- `lib/prompts.js` is where output quality is tuned. The search parser depends on the `HEADLINE:` style
  lines and the three dash separator; posts depend on `===SECTION===` markers (`lib/parse.js`).
- Regions are stored as labels. Anything that reads `researchLocations` should go through
  `normaliseRegions` in `lib/constants.js`.
- Huesy checks when asked; nothing runs on a schedule yet. The copy says so on purpose ("check whenever
  you like"). A scheduled check would need a cron and its own spend limits.
