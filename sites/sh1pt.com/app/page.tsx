export default function Home() {
  return (
    <main>
      <section>
        <div className="container">
          <div style={{ display: 'inline-block', padding: '0.3rem 0.7rem', border: '1px solid var(--border)', borderRadius: 999, fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            Early access · <strong style={{ color: 'var(--accent)' }}>$244/yr</strong> prepaid <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>$499</span>
          </div>
          <h1>Build. Promote. Scale. Iterate…</h1>
          <p className="muted" style={{ fontSize: 'clamp(1rem, 1.5vw, 1.2rem)', maxWidth: 780 }}>
            One codebase → every store, registry, CDN, and channel. Ads on every network. Cloud infra on demand. AI agents tighten the loop. sh1pt is the single command between an idea and global distribution.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <a className="btn" href="/waitlist">Join the waitlist — $244/yr locked in</a>
            <a className="btn secondary" href="/investors">For investors</a>
            <a className="btn secondary" href="/sh1pt-deck.pdf" download>Download deck (PDF)</a>
          </div>
          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Prepay via <strong>CoinPay</strong> (BTC / ETH / USDC / SOL) or card at launch. Lifetime price-lock.
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>The problem</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Shipping an app today means learning 30 different dashboards. The App Store, Play Console, Chrome Web Store, Homebrew tap, npm, Docker Hub, Cloudflare Pages, Fly, Railway, TestFlight, Product Hunt, X, LinkedIn, Reddit, Google Ads, Meta Ads, TikTok Ads, Stripe, CoinPay, Printful for swag, Listen Notes for podcast pitches, Resend for cold email, GitHub for releases, Vercel for hosting, Supabase for auth… the list doesn't end.
          </p>
          <p className="muted" style={{ maxWidth: 780 }}>
            Every surface has its own API, its own review queue, its own quirks. AI agents that generate apps get stuck the moment they need to publish, because no agent can learn all of this in one context.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <div style={{ maxWidth: 640, marginBottom: '2.5rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Install the CLI</div>
            <pre style={{ margin: 0 }}>curl -fsSL https://sh1pt.com/install.sh | sh</pre>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.4rem' }}>
              Or: <code>pnpm add -g @profullstack/sh1pt</code> · <code>bun i -g @profullstack/sh1pt</code> · <code>npm i -g @profullstack/sh1pt</code>
            </div>
          </div>
          <h2>The solution — one manifest, every surface</h2>
          <pre>{`sh1pt build       # compile artifacts
sh1pt promote     # publish (ship), ads, swag, investors, podcasts, cold email
sh1pt scale       # VPS, GPU, round-robin DNS, rollouts, cost
sh1pt iterate     # observe metrics → agent proposes fixes → ship, on loop`}</pre>
          <div className="grid grid-3" style={{ marginTop: '2rem' }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>30+ distribution surfaces</h3>
              <p className="muted">Web / PWA, iOS, Android, macOS, Windows, Linux, Steam Deck, Apple TV / Fire TV / Roku / Android TV / webOS, Meta Quest / Vision Pro / Pico, Chrome Web Store, npm / Homebrew / Docker / JSR, F-Droid, and more.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Every major ad network</h3>
              <p className="muted">Reddit, Meta, TikTok, Google, YouTube, X, Apple Search Ads, LinkedIn, Microsoft — one campaign description fans out.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Cloud infra on demand</h3>
              <p className="muted">RunPod GPUs, DigitalOcean, Vultr, Hetzner, Cloudflare, Railway — with hard cost ceilings so a forgotten A100 doesn't eat your runway.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>AI-agent-first</h3>
              <p className="muted">One API call publishes everywhere. Claude / Codex / Qwen drive sh1pt; sh1pt drives the distribution.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Policy linter baked in</h3>
              <p className="muted">Store rejections before submission — spammy titles, duplicate metadata, invalid bundle ids, reckless submission rate. Critical when agents generate at volume.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Sell first, build second</h3>
              <p className="muted">The default recipe stands up a waitlist + investor page + crypto-prepay checkout + referral program everywhere sh1pt ships. Prove demand, then build.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing">
        <div className="container">
          <h2>Pricing</h2>
          <div className="grid grid-3">
            <div className="card" style={{ borderColor: 'var(--accent)' }}>
              <div className="tag" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>Early access</div>
              <h3 style={{ marginTop: '0.5rem' }}>$244 / year</h3>
              <p className="muted">Prepaid via CoinPay (crypto) or Stripe (card). Lifetime price-lock. Founder-level support.</p>
              <ul className="muted" style={{ paddingLeft: '1.2rem' }}>
                <li>Every future feature</li>
                <li>Locked-in price forever</li>
                <li>Direct Slack with the team</li>
              </ul>
              <a className="btn" href="/waitlist">Claim a seat</a>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>$499 / year</h3>
              <p className="muted">Standard — kicks in at launch for everyone who didn't prepay.</p>
              <ul className="muted" style={{ paddingLeft: '1.2rem' }}>
                <li>All features</li>
                <li>Standard support</li>
              </ul>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>$49 / month</h3>
              <p className="muted">Monthly. Cancel anytime.</p>
              <ul className="muted" style={{ paddingLeft: '1.2rem' }}>
                <li>All features</li>
                <li>No commitment</li>
              </ul>
            </div>
          </div>
          <p className="muted" style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
            Self-host core is MIT-licensed and free forever. Cloud tier runs the build farm, credentials vault, store submission polling, policy linter, and rate-limit guardrails.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Refer friends → bank credits</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            <strong>$50 credit</strong> for every paying signup you bring. Tiered bonuses: <strong>+$150</strong> at 3 invites, <strong>+$600</strong> at 10, <strong>+$2000</strong> at 25. Your referral link lives on your dashboard after signup.
          </p>
        </div>
      </section>
    </main>
  );
}
