// The site's sample run: what a morning with Huesy looks like in five
// markets. Every brand here is invented, so no real company is ever shown
// with news that did not happen, and every card on the page is labelled
// as a sample.

export const MARKETS = [
  {
    id: "beauty",
    label: "Beauty",
    you: "Honest Glow",
    queries: ["skincare launch this week", "beauty collab announced", "beauty campaign customers"],
    signals: [
      {
        type: "Launch",
        source: "Instagram",
        ago: "2h ago",
        brand: "Solenne Skin",
        headline: "Solenne Skin drops a refillable SPF stick, teased only in Stories",
        why: "Refillable sun care is having a moment. A same day take puts you in the conversation before the recaps.",
      },
      {
        type: "Collab",
        source: "X",
        ago: "5h ago",
        brand: "Petal Theory",
        headline: "Petal Theory and a ceramics studio announce a limited vanity collection",
        why: "Collab chatter peaks within a day, so a reaction post today rides the wave.",
      },
      {
        type: "Campaign",
        source: "Google News",
        ago: "Yesterday",
        brand: "Mirabel Beauty",
        headline: "Mirabel Beauty swaps models for its own customers in a new campaign",
        why: "Real customer campaigns invite a “how we do it” post from brands like yours.",
      },
    ],
    post: {
      instagram:
        "Refills are going mainstream ☀️\n\nThis week another brand launched a refillable SPF stick, and we love to see it. Less plastic in your bathroom bin is a win, whoever makes it.\n\nOurs have been refill first since day one. Tap the link to see how they work.\n\n#refills #suncare #lessplastic",
      linkedin:
        "Refillable SPF just went mainstream.\n\nWhen a launch lands in Stories before any press release, it shows where the category's attention is: on packaging people can feel good about.\n\nWhat we've learned running refills since day one: people refill when it's easier than rebuying, and the refill has to look as good as the original.\n\nWhat would make you switch?",
      x: "Refillable SPF is officially mainstream. Took the category long enough ☀️",
      email:
        "Subject: Refills just went mainstream\n\nHi {{first_name}},\n\nA new refillable SPF stick launched this week, and it made us smile. Here's why we went refill first, and how to make your next bottle your last new one.",
    },
  },
  {
    id: "fashion",
    label: "Fashion",
    you: "Linen Day",
    queries: ["fashion collab this week", "brand opens first store", "denim rebrand"],
    signals: [
      {
        type: "Collab",
        source: "Instagram",
        ago: "1h ago",
        brand: "Northwake",
        headline: "Northwake teams up with a Lisbon tile studio on a summer capsule",
        why: "Craft collaborations are the story of the season. Your take on slow making lands well today.",
      },
      {
        type: "Expansion",
        source: "Google News",
        ago: "6h ago",
        brand: "Oro Atelier",
        headline: "Oro Atelier opens its first store outside Italy, in Copenhagen",
        why: "Store openings get shared for a day or two. A quick point of view makes you part of it.",
      },
      {
        type: "Repositioning",
        source: "X",
        ago: "Yesterday",
        brand: "Halden Denim",
        headline: "Halden Denim drops its old tagline and goes quiet luxury",
        why: "A rebrand people are arguing about is an easy, timely conversation starter.",
      },
    ],
    post: {
      instagram:
        "Made by hand, worn for years 🧵\n\nThis week a brand we admire launched a capsule with a tile studio in Lisbon, and it's a reminder of why craft matters.\n\nEvery Linen Day piece is cut and sewn in small batches. Swipe to meet the people who make them.\n\n#slowfashion #madebyhand #craft",
      linkedin:
        "Craft collaborations are having their moment.\n\nThis week's tile studio capsule in Lisbon is another sign that people want to know who made what they wear.\n\nFor small brands, that's an advantage: the story is already there. Ours starts with three people and a cutting table.\n\nWhat's the story behind what you're wearing today?",
      x: "Another craft collab, another sell out. People want to know who made their clothes. Good.",
      email:
        "Subject: The best collab of the week\n\nHi {{first_name}},\n\nA capsule made with a tile studio in Lisbon caught our eye this week. It's a reminder of why we make every piece in small batches, and we'd love to show you how.",
    },
  },
  {
    id: "food",
    label: "Food and drink",
    you: "Barley & Bloom",
    queries: ["new drink launch", "food brand campaign", "restaurant collab announced"],
    signals: [
      {
        type: "Launch",
        source: "Google News",
        ago: "3h ago",
        brand: "Ferment Folk",
        headline: "Ferment Folk launches a low sugar kombucha in cans",
        why: "Low sugar is the question your audience keeps asking. Today is the day to answer it.",
      },
      {
        type: "Campaign",
        source: "Instagram",
        ago: "8h ago",
        brand: "Little Grain Co",
        headline: "Little Grain Co asks fans to name its next flavour",
        why: "Naming campaigns pull comments. A playful nod from you joins the fun.",
      },
      {
        type: "Collab",
        source: "X",
        ago: "Yesterday",
        brand: "Casa Mosto",
        headline: "Casa Mosto pairs with a bakery chain on a breakfast menu",
        why: "Unexpected pairings travel fast. Share your own favourite pairing while it's fresh.",
      },
    ],
    post: {
      instagram:
        "Low sugar, full flavour 🍋\n\nThe fizzy drinks aisle got another low sugar can this week, and we're here for it.\n\nOur barley lemonade has 4 grams of sugar a can, because we squeeze the lemons ourselves. Taste it this weekend at the market.\n\n#lowsugar #craftdrinks #barleyandbloom",
      linkedin:
        "Low sugar just stopped being a niche.\n\nAnother low sugar can landed this week, and the shelf space tells the story: people want flavour without the crash.\n\nFor small producers, the opening is honesty about what's inside. Ours fits on one line.\n\nWhat's the last label you read before buying?",
      x: "Low sugar fizzy drinks are the new normal. Read the label, it tells you everything.",
      email:
        "Subject: The low sugar shelf is growing\n\nHi {{first_name}},\n\nAnother low sugar drink launched this week. Here's what's in ours, why we keep it to one short line, and a recipe for the weekend.",
    },
  },
  {
    id: "tech",
    label: "Tech",
    you: "Fieldnote",
    queries: ["app launches feature", "software pricing change", "startup backlash"],
    signals: [
      {
        type: "Launch",
        source: "X",
        ago: "1h ago",
        brand: "Pocketloom",
        headline: "Pocketloom ships offline mode, its most requested feature",
        why: "Offline is a pain your users know well. Say how you handle it today, while people are comparing.",
      },
      {
        type: "Market move",
        source: "Google News",
        ago: "4h ago",
        brand: "Brightfold",
        headline: "Brightfold cuts its team plan price by a third",
        why: "Price moves get discussed for days. A calm, clear post on your value travels.",
      },
      {
        type: "Controversy",
        source: "X",
        ago: "Yesterday",
        brand: "Quillnote",
        headline: "Quillnote walks back a data policy after user pushback",
        why: "Trust is the topic of the week. A plain post on how you treat data is well timed.",
      },
    ],
    post: {
      instagram:
        "Works on the train, works on the plane ✈️\n\nOffline mode is having a week. Ours has been there from the start: every note you take saves on your phone first and syncs when you're back online.\n\nLink in bio to try it.\n\n#productivity #offlinefirst #fieldnote",
      linkedin:
        "Offline mode is the most requested feature in note taking, and this week it was everywhere.\n\nWe built Fieldnote offline first because notes happen in places without signal: site visits, flights, basements.\n\nThe lesson: build for where people actually are, not where the demo happens.\n\nWhere do you take most of your notes?",
      x: "Offline mode shouldn't be a feature. It should be the default. Ours always has been.",
      email:
        "Subject: Notes that work without signal\n\nHi {{first_name}},\n\nOffline mode was the talk of the week. Here's how Fieldnote has handled it from day one, and three tips for working on the move.",
    },
  },
  {
    id: "fitness",
    label: "Fitness",
    you: "Pace Club",
    queries: ["running brand collab", "gym opens new location", "fitness campaign"],
    signals: [
      {
        type: "Collab",
        source: "Instagram",
        ago: "2h ago",
        brand: "Stridewell",
        headline: "Stridewell and a sleep app team up on a recovery program",
        why: "Recovery is the conversation of the month. Share how your community rests.",
      },
      {
        type: "Expansion",
        source: "Google News",
        ago: "7h ago",
        brand: "Arcform Studio",
        headline: "Arcform Studio opens its fifth location, with a free first week",
        why: "Openings bring new people into fitness. Welcome them with a beginner friendly post.",
      },
      {
        type: "Campaign",
        source: "X",
        ago: "Yesterday",
        brand: "Holo Run Club",
        headline: "Holo Run Club's slow is fine campaign is going viral",
        why: "Running at your own pace is resonating. It's an easy, honest post for you today.",
      },
    ],
    post: {
      instagram:
        "Rest days count too 😴\n\nRecovery is everywhere this week, and we couldn't agree more. Our Sunday group is a 5k walk and a long breakfast.\n\nNew faces always welcome. Details in bio.\n\n#recovery #runclub #restday",
      linkedin:
        "Recovery is finally getting the attention it deserves.\n\nThis week's sleep and running collaboration says out loud what coaches have said for years: you get fitter while you rest.\n\nAt Pace Club, every fourth session is a recovery walk, and attendance is higher on those days than any other.\n\nHow do you build rest into your week?",
      x: "Rest is training. This week the whole industry seems to agree.",
      email:
        "Subject: Your rest day plan\n\nHi {{first_name}},\n\nRecovery was the big story in fitness this week. Here's how we build rest into the Pace Club week, and a gentle Sunday route to try.",
    },
  },
];

export const POST_TABS = [
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "email", label: "Newsletter" },
];

// What people can say they want watched, after joining.
export const WATCH_CHOICES = [
  { id: "beauty", label: "Beauty" },
  { id: "fashion", label: "Fashion" },
  { id: "food", label: "Food and drink" },
  { id: "tech", label: "Tech" },
  { id: "fitness", label: "Fitness" },
  { id: "other", label: "Something else" },
];
