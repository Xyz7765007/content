"use client";
import { useEffect, useRef, useState } from "react";
import { TypeBadge, Wordmark } from "./icons";

// The opening screen, shown once per session before the wizard.
// Shell register: expressive gradient + grain, editorial type. None of this
// language appears inside the working app.

const EXAMPLES = [
  {
    type: "product_launch", brand: "Marlow Coffee",
    headline: "Marlow Coffee launches a nitro cold brew can exclusive to quick-commerce for the first month",
    why: "A direct competitor just took the shelf you want. A taste-test post beats a launch post.",
    post: "everyone in coffee is talking about the can.\n\nnobody is talking about the shelf.\n\nmarlow did not win a product race this week. they won a distribution race. a ten-minute delivery slot is worth more than a new flavour.\n\nif you sell anything on quick-commerce, which slot do you own?",
  },
  {
    type: "controversy", brand: "Kite Analytics",
    headline: "Kite Analytics criticised after its AI assistant emailed customers without approval",
    why: "Autonomy without an approval gate just embarrassed a category leader. Gated AI is a selling point today.",
    post: "unpopular opinion: the kite story is not about AI going rogue.\n\nit is about a missing checkbox.\n\none approval step between the model and the customer, and the whole week looks different.\n\nwhere in your stack does something send without a human seeing it first?",
  },
  {
    type: "collab", brand: "Northwind Skincare",
    headline: "Northwind Skincare partners with a dermatology chain for in-clinic sampling",
    why: "Trust is being bought with proximity to experts. A clinic is the new billboard.",
    post: "northwind just put its serum next to a dermatologist instead of next to an influencer.\n\nthat is not a partnership. that is a positioning statement.\n\nproximity to expertise is the cheapest trust you can buy right now.\n\nwho is the expert your brand should be standing next to?",
  },
];

export default function Opening({ onEnter }) {
  const [order, setOrder] = useState([0, 1, 2]);
  const [flipped, setFlipped] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      if (document.hidden || flipped !== null) return;
      setOrder((o) => [...o.slice(1), o[0]]);
    }, 5000);
    return () => clearInterval(timer.current);
  }, [flipped]);

  const pill = { display: "inline-flex", alignItems: "center", gap: 8, height: 42, padding: "0 20px", borderRadius: "var(--r-chip)", background: "var(--ink)", color: "var(--ink-inv)", fontWeight: 600, fontSize: 14, border: 0, cursor: "pointer", fontFamily: "var(--f-text)" };
  const ghost = { ...pill, background: "transparent", color: "var(--ink)", border: "1px solid var(--border-strong)" };
  const face = { borderRadius: "var(--r-card)", background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--e3)", padding: 20, display: "flex", flexDirection: "column" };

  return (
    <div className="ce-shell">
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1120, margin: "0 auto", padding: "18px 28px" }}>
        <Wordmark size={22} />
        <div className="ce-hide-sm" style={{ display: "flex", gap: 22, fontSize: 13.5, color: "var(--ink-2)" }}>
          <span>How it works</span><span>Signals</span><span>Platforms</span>
        </div>
        <button type="button" className="ce-pill" onClick={onEnter} style={{ ...pill, height: 40 }}>Open the app</button>
      </nav>

      <section className="ce-hero" style={{ maxWidth: 1120, margin: "0 auto", padding: "44px 28px 36px", display: "grid", gridTemplateColumns: "7fr 5fr", gap: 48, alignItems: "center" }}>
        <div>
          <div className="ce-rise" style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent)", display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-soft)" }} /> signal driven content · last seven days
          </div>
          <h1 className="ce-rise d1" style={{ fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "clamp(2.2rem, 1.3rem + 3.2vw, 3.6rem)", lineHeight: 1.06, letterSpacing: "-.02em", margin: "0 0 18px", maxWidth: "22ch", textWrap: "balance", color: "var(--ink)" }}>
            Your competitor shipped something at 9am. Your post should be live by 10.
          </h1>
          <p className="ce-rise d2" style={{ fontSize: 17, lineHeight: 1.55, color: "var(--ink-2)", maxWidth: "52ch", margin: "0 0 26px" }}>
            Content Engine scans the last seven days of brand and marketing news for the niche you serve, ranks the signals, and turns the ones you pick into posts for Instagram, LinkedIn, X and email. In your brand voice, with the source attached.
          </p>
          <div className="ce-rise d3" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" className="ce-pill" onClick={onEnter} style={pill}>Open the app →</button>
            <a className="ce-pill ghost" href="#how" style={{ ...ghost, textDecoration: "none" }}>How it works</a>
          </div>
        </div>

        <div>
          <div className="ce-stack" style={{ position: "relative", height: 330 }}>
            {order.map((idx) => {
              const ex = EXAMPLES[idx];
              const on = flipped === idx;
              return (
                <div key={idx} className="ce-sc">
                  <div className="ce-flipwrap">
                    <div className={`ce-flip ${on ? "on" : ""}`}>
                      <div className="ce-face" style={face}>
                        <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 12 }}>
                          <TypeBadge type={ex.type} /><span style={{ fontWeight: 600, fontSize: 13 }}>{ex.brand}</span>
                          <span style={{ marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)" }}>example</span>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3, letterSpacing: "-.012em", marginBottom: 10, color: "var(--ink)" }}>{ex.headline}</div>
                        <div style={{ borderLeft: "3px solid var(--blue)", padding: "1px 0 1px 12px", marginBottom: 12 }}>
                          <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--link)", display: "block", marginBottom: 3 }}>Why this matters</span>
                          <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: "var(--ink)" }}>{ex.why}</p>
                        </div>
                        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)", borderTop: "1px solid var(--hair)", paddingTop: 10 }}>
                          <span>illustrative signal, not live news</span>
                          <button type="button" className="ce-btn ce-btn-ghost" onClick={() => setFlipped(idx)} style={{ height: 28, padding: "0 10px", borderRadius: 7, background: "transparent", color: "var(--accent)", border: 0, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "var(--f-text)" }}>See the post →</button>
                        </div>
                      </div>
                      <div className="ce-face back" style={face}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 12.5 }}><b>LinkedIn</b><span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-3)", fontSize: 11 }}>· generated from the signal</span></div>
                        <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", flex: 1, overflow: "hidden", color: "var(--ink)" }}>{ex.post}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)", borderTop: "1px solid var(--hair)", paddingTop: 10, marginTop: 10 }}>
                          <span>example output</span>
                          <button type="button" className="ce-btn ce-btn-ghost" onClick={() => setFlipped(null)} style={{ height: 28, padding: "0 10px", borderRadius: 7, background: "transparent", color: "var(--accent)", border: 0, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "var(--f-text)" }}>← Back</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ margin: "40px 0 0 24px", fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--ink-3)" }}>Click a card to see the post it becomes</p>
        </div>
      </section>

      <section id="how" className="ce-how" style={{ maxWidth: 1120, margin: "0 auto", padding: "36px 28px 56px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 22, borderTop: "1px dashed var(--border)" }}>
        {[
          ["01", "Describe the brand once", "Name, product, audience, voice, values, and a few posts you are proud of. Per platform if the voice changes."],
          ["02", "Choose targets and signal types", "A niche or an account list. Launches, market moves, campaigns, controversies, collabs. Set the regions."],
          ["03", "Pick the signals worth your name", "Fifty signals from the last seven days, each with its source. The ten hottest come first."],
          ["04", "Generate for every platform", "Finished posts, captions, briefs and creatives. Redo anything. Export or save what you like."],
        ].map(([n, h, p]) => (
          <div key={n}>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 44, lineHeight: 1, color: "var(--ink)", opacity: .14, fontWeight: 600 }}>{n}</div>
            <h3 style={{ fontSize: 15, margin: "6px 0 6px", fontWeight: 600, color: "var(--ink)" }}>{h}</h3>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{p}</p>
          </div>
        ))}
      </section>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 28px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)" }}>Content Engine · signal driven content</p>
        <button type="button" className="ce-pill" onClick={onEnter} style={pill}>Open the app →</button>
      </div>
    </div>
  );
}
