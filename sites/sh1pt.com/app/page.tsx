import CopyableCommand from './components/CopyableCommand';

export default function Home() {
  return (
    <main>
      <section>
        <div className="container">
          <div style={{ display: 'inline-block', padding: '0.3rem 0.7rem', border: '1px solid var(--border)', borderRadius: 999, fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            Open-source CLI + paid cloud control plane · <strong style={{ color: 'var(--accent)' }}>$244/yr</strong> founder access
          </div>
          <h1>Sh1pt Cloud</h1>
          <p className="muted" style={{ fontSize: 'clamp(1rem, 1.5vw, 1.2rem)', maxWidth: 780 }}>
            The hosted distribution control plane for the open-source <code>sh1pt</code> CLI. Keep shipping from the terminal, but stop babysitting builds, credentials, submissions, retries, store reviews, repo workflows, and agent loops on your laptop.
          </p>
          <div style={{ maxWidth: 640, marginTop: '1.75rem' }}>
            <CopyableCommand label="Install" command="curl -fsSL https://sh1pt.com/install.sh | sh" />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <a className="btn" href="/waitlist">Join the waitlist — $244/yr locked in</a>
            <a className="btn secondary" href="/getting-started">Getting started</a>
            <a className="btn secondary" href="/investors">For investors</a>
            <a className="btn secondary" href="/sh1pt-deck.pdf" download>Download deck (PDF)</a>
          </div>
          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Prepay via <strong>CoinPay</strong> (BTC / ETH / USDC / SOL) or card at launch. Lifetime price-lock.
          </div>
          <pre style={{ marginTop: '2rem', maxWidth: 760 }}>{`sh1pt login
sh1pt build --cloud
sh1pt promote ship --cloud --target appstore play npm docker
sh1pt promote ship status
sh1pt run logs <run-id> -f`}</pre>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>The problem</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Shipping an app today means learning 30 different dashboards. The App Store, Play Console, Chrome Web Store, Homebrew tap, npm, Docker Hub, Cloudflare Pages, Fly, Railway, TestFlight, Product Hunt, X, LinkedIn, Reddit, Google Ads, Meta Ads, TikTok Ads, Stripe, CoinPay, Printful for swag, Listen Notes for podcast pitches, Resend for cold email, GitHub for releases, Vercel for hosting, Supabase for auth... the list does not end.
          </p>
          <p className="muted" style={{ maxWidth: 780 }}>
            Every surface has its own API, review queue, failure mode, and rate limit. AI agents can generate the app, but they stall when distribution requires store credentials, signed builds, asynchronous reviews, flaky APIs, and vendor-specific policy checks.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <div style={{ maxWidth: 640, marginBottom: '2.5rem', display: 'grid', gap: '0.75rem' }}>
            <CopyableCommand label="Install via shell" command="curl -fsSL https://sh1pt.com/install.sh | sh" />
            <CopyableCommand label="bun" command="bun i -g @profullstack/sh1pt" />
            <CopyableCommand label="pnpm" command="pnpm add -g @profullstack/sh1pt" />
            <CopyableCommand label="npm" command="npm i -g @profullstack/sh1pt" />
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              Need the full walkthrough? See <a href="/getting-started">getting started</a>.
            </div>
          </div>
          <h2>The CLI is free. The cloud does the parts your laptop should not.</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            The CLI is the developer interface. Sh1pt Cloud is the durable execution layer: hosted runners, encrypted release credentials, persistent logs, artifacts, retries, submission polling, and team workflows.
          </p>
          <pre>{`sh1pt build       # compile artifacts
sh1pt promote     # publish (ship), ads, swag, investors, podcasts, cold email
sh1pt scale       # VPS, GPU, round-robin DNS, rollouts, cost
sh1pt iterate     # observe metrics → agent proposes fixes → ship, on loop`}</pre>
          <div className="grid grid-3" style={{ marginTop: '2rem' }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Local mode</h3>
              <p className="muted">Free, MIT-licensed, and useful without an account: manifests, local builds, dry-runs, adapters, static policy linting, and project scaffolding.</p>
              <CopyableCommand command="sh1pt build" />
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Cloud mode</h3>
              <p className="muted">Hosted Linux, macOS, and Windows runners; encrypted secrets; durable runs; review polling; rate-limit protection; webhooks; logs; artifacts.</p>
              <CopyableCommand command="sh1pt build --cloud" />
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Agent mode</h3>
              <p className="muted">Claude, Codex, Qwen, and other agents call the same CLI while Sh1pt Cloud enforces policy, secrets, retries, budgets, and audit logs.</p>
              <CopyableCommand command="sh1pt iterate watch --cloud" />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>What Sh1pt Cloud runs for you</h2>
          <div className="grid grid-3" style={{ marginTop: '2rem' }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Remote build runners</h3>
              <p className="muted">Linux, macOS/iOS signing, Windows, Android, Docker, package builds, reproducible environments, artifact storage, and streamed logs.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Credentials vault</h3>
              <p className="muted">Store App Store Connect keys, Google Play service accounts, npm tokens, Docker credentials, Cloudflare tokens, and webhook secrets outside your repo.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Submission monitoring</h3>
              <p className="muted">Start a release from the CLI, then let the cloud poll App Store, Play, Chrome Web Store, npm, Docker/GHCR, Homebrew, Cloudflare, and GitHub Releases.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Policy and rate limits</h3>
              <p className="muted">Block risky submissions, lint metadata, space API calls, retry rate-limited vendors, and keep agents from pushing bad releases at volume.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>RepoOps fleet management</h3>
              <p className="muted">Scan GitHub orgs, recommend workflow packs, open PRs, detect drift, pin Actions SHAs, and audit permissions, timeouts, and concurrency rules.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Persistent run history</h3>
              <p className="muted">Every run keeps logs, artifacts, status transitions, webhooks, team activity, and audit records so you can answer what shipped, where, and why.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing">
        <div className="container">
          <h2>Pricing</h2>
          <div className="grid grid-3">
            <div className="card">
              <div className="tag">Free</div>
              <h3 style={{ marginTop: '0.5rem' }}>OSS CLI</h3>
              <p className="muted">MIT-licensed core for local workflows and self-hosted distribution experiments.</p>
              <ul className="muted" style={{ paddingLeft: '1.2rem' }}>
                <li>Local builds and dry-runs</li>
                <li>Manifest validation</li>
                <li>Static policy lint</li>
                <li>Adapters and scaffolds</li>
              </ul>
              <a className="btn secondary" href="https://github.com/profullstack/sh1pt">View source</a>
            </div>
            <div className="card" style={{ borderColor: 'var(--accent)' }}>
              <div className="tag" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>Founder</div>
              <h3 style={{ marginTop: '0.5rem' }}>$244 / year</h3>
              <p className="muted">Early access to Sh1pt Cloud with a lifetime price lock.</p>
              <ul className="muted" style={{ paddingLeft: '1.2rem' }}>
                <li>Cloud runs and build minutes</li>
                <li>Secrets vault</li>
                <li>Logs and artifacts</li>
                <li>Direct founder support</li>
              </ul>
              <a className="btn" href="/waitlist">Claim a seat</a>
            </div>
            <div className="card">
              <div className="tag">Pro</div>
              <h3 style={{ marginTop: '0.5rem' }}>$49 / month</h3>
              <p className="muted">Or $499/year after launch. Built for commercial projects and teams.</p>
              <ul className="muted" style={{ paddingLeft: '1.2rem' }}>
                <li>Hosted runners</li>
                <li>Submission polling</li>
                <li>Policy guardrails</li>
                <li>Team dashboard and webhooks</li>
              </ul>
            </div>
          </div>
          <p className="muted" style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
            Expensive resources such as macOS minutes, Windows minutes, browser automation, large artifact storage, and high-volume polling may move to usage-based overages later. Sh1pt does not take a cut of your app revenue.
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
