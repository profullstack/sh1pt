export const metadata = {
  title: 'Investors · sh1pt',
  description: 'sh1pt — the single command between an idea and global distribution. Early-stage fundraise. Prepaid revenue in-flight.',
};

export default function Investors() {
  return (
    <main>
      <section>
        <div className="container">
          <div className="tag">seed round</div>
          <h1>The distribution layer for the AI-built software era.</h1>
          <p className="muted" style={{ fontSize: 'clamp(1rem, 1.4vw, 1.15rem)', maxWidth: 780 }}>
            AI agents now generate a working app in minutes. Shipping that app — to 30+ stores, running ads on 10 networks, provisioning infra, processing payments, coordinating a launch — still takes weeks of founder time. sh1pt collapses the post-generation loop into <code>build → promote → scale → iterate</code> — one manifest, one CLI, one cloud.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <a className="btn" href="mailto:investors@sh1pt.com">Talk to us → investors@sh1pt.com</a>
            <a className="btn secondary" href="/deck">Read the deck</a>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Market</h2>
          <div className="grid grid-3">
            <div className="card">
              <div className="tag">TAM</div>
              <h3 style={{ marginTop: '0.5rem' }}>~30M</h3>
              <p className="muted">software developers worldwide (SlashData, 2024).</p>
            </div>
            <div className="card">
              <div className="tag">SAM</div>
              <h3 style={{ marginTop: '0.5rem' }}>~5M</h3>
              <p className="muted">developers shipping commercial applications across at least two stores/registries.</p>
            </div>
            <div className="card">
              <div className="tag">SOM</div>
              <h3 style={{ marginTop: '0.5rem' }}>100k+</h3>
              <p className="muted">indie + AI-agent-driven builders shipping at volume (Expo, Vercel, Replit cohort).</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Why now</h2>
          <div className="grid grid-3">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>AI coding agents shipped production code in 2024–26</h3>
              <p className="muted">Claude Code, Codex, Qwen, Cursor Composer. Generation is solved; distribution is the new bottleneck.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Store APIs are finally consistent enough to automate</h3>
              <p className="muted">App Store Connect, Play Developer, Chrome Web Store, Meta Horizon — all expose submission APIs. Five years ago this integration was impossible.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Crypto pre-sell is the new waitlist</h3>
              <p className="muted">CoinPay / Solana Pay / Coinbase Commerce make pre-launch revenue frictionless and unrefundable — perfect for validating demand before build.</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Traction</h2>
          <p className="muted">Placeholder until we've earned something to put here — waitlist signups, prepaid ARR, pilot customers. Fill in when real.</p>
          <div className="grid grid-3" style={{ marginTop: '1rem' }}>
            <div className="card"><h3 style={{ marginTop: 0 }}>Waitlist</h3><p className="muted">—</p></div>
            <div className="card"><h3 style={{ marginTop: 0 }}>Prepaid ARR</h3><p className="muted">—</p></div>
            <div className="card"><h3 style={{ marginTop: 0 }}>GitHub stars</h3><p className="muted">—</p></div>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Business model</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Open-source core (MIT) + managed cloud subscription. <strong>$499/yr standard</strong>, <strong>$244/yr early-bird prepay</strong> (locked-in, no annual increase). Cloud runs the build farm (Linux + macOS + Windows runners), credentials vault, store-submission polling, policy linter, and rate-limit guardrails. Revenue is recurring and ARR-friendly. No platform take-rate on customers' own apps — we make money on the tool, not their wallet.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Roadmap</h2>
          <ul className="muted" style={{ paddingLeft: '1.2rem', maxWidth: 780 }}>
            <li><strong>Q1</strong> — Stubs hardened into working adapters for npm / Homebrew / iOS / Android / Chrome / Cloudflare Pages. Prepaid waitlist live at sh1pt.com.</li>
            <li><strong>Q2</strong> — macOS / Windows desktop, TV targets (tvOS / Fire TV / Android TV), XR (Quest / Vision Pro). First 100 paid customers.</li>
            <li><strong>Q3</strong> — Promote (ads + social + outreach + merch) live. First ARR milestone.</li>
            <li><strong>Q4</strong> — Scale (infra + DNS + rollouts) and iterate (agent-driven metric loops) generally available.</li>
          </ul>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Team</h2>
          <p className="muted">Profullstack, Inc. — founded by Anthony Ettinger. Filled in when we're ready to name names.</p>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Talk to us</h2>
          <p className="muted">
            Check size: $25k–$500k for this round. Lead investors welcome — reach out before the round closes to a broad LP list.
          </p>
          <a className="btn" href="mailto:investors@sh1pt.com">investors@sh1pt.com</a>
        </div>
      </section>
    </main>
  );
}
