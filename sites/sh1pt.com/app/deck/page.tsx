'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './deck.css';

type Slide = {
  id: string;
  tag?: string;
  content: ReactNode;
};

const slides: Slide[] = [
  {
    id: 'title',
    content: (
      <div className="slide slide-title">
        <img src="/logo.svg" alt="sh1pt" height={72} style={{ marginBottom: '2.5rem' }} />
        <h1>Build. Promote. Scale. Iterate…</h1>
        <p className="lead">
          The single command between an idea and global distribution.
        </p>
        <div className="meta">Seed round · Profullstack, Inc. · 2026</div>
      </div>
    ),
  },
  {
    id: 'problem',
    tag: 'The problem',
    content: (
      <div className="slide">
        <h2>AI can build an app in minutes.</h2>
        <h2 className="accent">Shipping it still takes weeks.</h2>
        <p className="lead">
          Thirty different dashboards. Thirty review queues. Thirty quirks. Every AI coding agent
          that generates a working app hits a wall the moment it tries to publish.
        </p>
        <div className="chip-row">
          <span className="chip">App Store</span>
          <span className="chip">Play Console</span>
          <span className="chip">Chrome Web Store</span>
          <span className="chip">npm</span>
          <span className="chip">Homebrew</span>
          <span className="chip">F-Droid</span>
          <span className="chip">JSR</span>
          <span className="chip">Docker Hub</span>
          <span className="chip">Cloudflare</span>
          <span className="chip">Railway</span>
          <span className="chip">TestFlight</span>
          <span className="chip">Product Hunt</span>
          <span className="chip">Reddit Ads</span>
          <span className="chip">Meta Ads</span>
          <span className="chip">TikTok Ads</span>
          <span className="chip">Google Ads</span>
          <span className="chip">Apple Search</span>
          <span className="chip">LinkedIn</span>
          <span className="chip">X</span>
          <span className="chip">Stripe</span>
          <span className="chip">CoinPay</span>
          <span className="chip">Printful</span>
          <span className="chip">Resend</span>
          <span className="chip">Listen Notes</span>
          <span className="chip">…</span>
        </div>
      </div>
    ),
  },
  {
    id: 'solution',
    tag: 'The solution',
    content: (
      <div className="slide">
        <h2>One manifest. Every surface.</h2>
        <pre className="code-block">{`sh1pt build       # compile artifacts
sh1pt promote     # publish, ads, swag, investors, podcasts, cold email
sh1pt scale       # VPS, GPU, DNS, rollouts, cost ceilings
sh1pt iterate     # observe → agent proposes → ship — on loop`}</pre>
        <p className="lead">
          Four verbs. One CLI. One cloud. An AI agent can drive all of it with a single API call —
          and sh1pt enforces policy, rate limits, and cost caps so an agent can't get you banned or
          burn your runway.
        </p>
      </div>
    ),
  },
  {
    id: 'why-now',
    tag: 'Why now',
    content: (
      <div className="slide">
        <h2>The window opened in 2024.</h2>
        <div className="grid-3">
          <div className="card">
            <div className="tag">01</div>
            <h3>AI agents ship production code</h3>
            <p>
              Claude Code, Codex, Qwen, Cursor Composer. Generation is solved. Distribution is the
              new bottleneck.
            </p>
          </div>
          <div className="card">
            <div className="tag">02</div>
            <h3>Store APIs are finally automatable</h3>
            <p>
              App Store Connect, Play Developer, Chrome Web Store, Meta Horizon — all now expose
              submission APIs. Five years ago this was impossible.
            </p>
          </div>
          <div className="card">
            <div className="tag">03</div>
            <h3>Crypto pre-sell replaces the waitlist</h3>
            <p>
              CoinPay / Solana Pay / Coinbase Commerce make pre-launch revenue frictionless and
              unrefundable. Validate demand before you build.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'market',
    tag: 'Market',
    content: (
      <div className="slide">
        <h2>A market as large as every app that ever needs to ship.</h2>
        <div className="grid-3 market">
          <div className="card">
            <div className="tag">TAM</div>
            <div className="big-num">~30M</div>
            <p>software developers worldwide (SlashData, 2024).</p>
          </div>
          <div className="card">
            <div className="tag">SAM</div>
            <div className="big-num">~5M</div>
            <p>developers shipping commercial apps across at least two stores.</p>
          </div>
          <div className="card highlight">
            <div className="tag">SOM</div>
            <div className="big-num">100k+</div>
            <p>indie + AI-agent-driven builders shipping at volume (Expo, Vercel, Replit cohort).</p>
          </div>
        </div>
        <p className="footnote">
          Every AI coding tool adds to our SOM. Our market grows with every Claude Code / Codex / Cursor seat sold.
        </p>
      </div>
    ),
  },
  {
    id: 'product',
    tag: 'Product',
    content: (
      <div className="slide">
        <h2>What sh1pt covers today.</h2>
        <div className="grid-3">
          <div className="card">
            <h3>30+ distribution surfaces</h3>
            <p>
              Web / PWA, iOS, Android, macOS, Windows, Linux, Steam Deck, Apple TV / Fire TV / Roku
              / Android TV, Meta Quest / Vision Pro / Pico, Chrome Web Store, npm / Homebrew /
              Docker / JSR, F-Droid.
            </p>
          </div>
          <div className="card">
            <h3>Every major ad network</h3>
            <p>
              Reddit, Meta, TikTok, Google, YouTube, X, Apple Search Ads, LinkedIn, Microsoft — one
              campaign description fans out.
            </p>
          </div>
          <div className="card">
            <h3>Cloud infra on demand</h3>
            <p>
              RunPod GPUs, DigitalOcean, Vultr, Hetzner, Cloudflare, Railway — with hard cost
              ceilings so a forgotten A100 doesn't eat your runway.
            </p>
          </div>
          <div className="card">
            <h3>Agent-first API</h3>
            <p>
              One call publishes everywhere. Claude / Codex / Qwen drive sh1pt; sh1pt drives the
              distribution.
            </p>
          </div>
          <div className="card">
            <h3>Policy linter baked in</h3>
            <p>
              Catches store rejections before submission — spammy titles, duplicate metadata,
              invalid bundle ids, reckless rate. Critical at agent volume.
            </p>
          </div>
          <div className="card">
            <h3>Sell-first recipe</h3>
            <p>
              Default stack spins up waitlist + investor page + crypto-prepay checkout + referral
              program on every channel sh1pt ships to.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'business-model',
    tag: 'Business model',
    content: (
      <div className="slide">
        <h2>Open core. Managed cloud. ARR.</h2>
        <div className="grid-3">
          <div className="card highlight">
            <div className="tag">Early access</div>
            <div className="big-num">$244<span className="tiny">/yr</span></div>
            <p>Prepaid (crypto or card). Lifetime price-lock. Founder-level support.</p>
          </div>
          <div className="card">
            <div className="tag">Standard</div>
            <div className="big-num">$499<span className="tiny">/yr</span></div>
            <p>Kicks in at launch for everyone who didn't prepay.</p>
          </div>
          <div className="card">
            <div className="tag">Monthly</div>
            <div className="big-num">$49<span className="tiny">/mo</span></div>
            <p>Cancel anytime.</p>
          </div>
        </div>
        <p className="footnote">
          Self-host core is MIT. Cloud runs the build farm (Linux + macOS + Windows runners),
          credentials vault, submission polling, policy linter, rate-limit guardrails.
          <strong> No platform take-rate on customers' apps.</strong> We make money on the tool, not their wallet.
        </p>
      </div>
    ),
  },
  {
    id: 'traction',
    tag: 'Traction',
    content: (
      <div className="slide">
        <h2>Early signals.</h2>
        <div className="grid-3">
          <div className="card">
            <div className="tag">Waitlist</div>
            <div className="big-num">—</div>
            <p>Live at sh1pt.com. Prepay locked-in at $244 lifetime.</p>
          </div>
          <div className="card">
            <div className="tag">Prepaid ARR</div>
            <div className="big-num">—</div>
            <p>In-flight. First closes will be reported here.</p>
          </div>
          <div className="card">
            <div className="tag">GitHub</div>
            <div className="big-num">—</div>
            <p>Open-source core at profullstack/sh1pt. 175+ adapters scaffolded.</p>
          </div>
        </div>
        <p className="footnote muted">
          Placeholder until we've earned something to put here. We will not fabricate numbers.
        </p>
      </div>
    ),
  },
  {
    id: 'moat',
    tag: 'Moat',
    content: (
      <div className="slide">
        <h2>Why the moat compounds.</h2>
        <ul className="big-list">
          <li>
            <strong>Every new adapter</strong> benefits every existing customer. Network of
            integrations, not a network of users.
          </li>
          <li>
            <strong>The policy linter</strong> gets smarter with every store rejection across the
            whole customer base. A new customer inherits thousands of learned rules on day one.
          </li>
          <li>
            <strong>Credential + identity vault</strong> is the highest-switching-cost part. Once
            your Apple, Play, Stripe, ad accounts, and keys live in sh1pt, moving them out is the
            blocker — not the CLI.
          </li>
          <li>
            <strong>Agent-first from day one.</strong> Every AI coding tool is a potential OEM
            channel. Cursor / Claude Code / Codex can bundle sh1pt for publishing long before a
            competitor catches up on store coverage.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'roadmap',
    tag: 'Roadmap',
    content: (
      <div className="slide">
        <h2>The next 12 months.</h2>
        <div className="timeline">
          <div className="timeline-item">
            <div className="tag">Q1</div>
            <div>
              <strong>Hardened adapters.</strong> npm, Homebrew, iOS, Android, Chrome, Cloudflare
              Pages shipping real traffic. Prepaid waitlist live.
            </div>
          </div>
          <div className="timeline-item">
            <div className="tag">Q2</div>
            <div>
              <strong>Desktop + TV + XR.</strong> macOS, Windows, tvOS, Fire TV, Android TV, Quest,
              Vision Pro. First 100 paid customers.
            </div>
          </div>
          <div className="timeline-item">
            <div className="tag">Q3</div>
            <div>
              <strong>Promote GA.</strong> Ads + social + outreach + merch live end-to-end. First
              ARR milestone.
            </div>
          </div>
          <div className="timeline-item">
            <div className="tag">Q4</div>
            <div>
              <strong>Scale + iterate GA.</strong> Infra, DNS, rollouts, agent-driven metric loops
              generally available.
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'team',
    tag: 'Team',
    content: (
      <div className="slide">
        <h2>Team.</h2>
        <p className="lead">
          <strong>Profullstack, Inc.</strong> — founded by Anthony Ettinger. Twenty-plus years
          building full-stack systems, the last three deep in AI-agent tooling.
        </p>
        <p className="lead muted">
          Co-founders and early hires to be named as the round closes.
        </p>
        <p className="footnote">
          Built in the open at <code>github.com/profullstack/sh1pt</code>. MIT-licensed core. Every commit public.
        </p>
      </div>
    ),
  },
  {
    id: 'ask',
    tag: 'The ask',
    content: (
      <div className="slide slide-ask">
        <div className="tag">Seed round · open</div>
        <h2>$25k – $500k checks.</h2>
        <p className="lead">
          Capital funds the build farm (macOS + Windows runners are the expensive bit), the first
          two hires on the adapter team, and the compliance / credential-vault buildout.
        </p>
        <p className="lead">
          Lead investors welcome. Closing to a broad LP list shortly after.
        </p>
        <a className="btn-big" href="mailto:investors@sh1pt.com">
          investors@sh1pt.com →
        </a>
        <div className="meta">Talk to us before the round closes.</div>
      </div>
    ),
  },
];

export default function Deck() {
  const [index, setIndex] = useState(0);
  const total = slides.length;
  const containerRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (next: number) => {
      setIndex(Math.max(0, Math.min(total - 1, next)));
    },
    [total]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        go(total - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go, total]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = parseInt(window.location.hash.replace('#', ''), 10);
    if (!Number.isNaN(hash) && hash >= 1 && hash <= total) {
      setIndex(hash - 1);
    }
  }, [total]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    history.replaceState(null, '', `#${index + 1}`);
  }, [index]);

  return (
    <div className="deck-root" ref={containerRef}>
      <div className="deck-progress" aria-hidden>
        <div className="deck-progress-bar" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <div className="deck-stage">
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            className={`deck-slide ${i === index ? 'is-active' : i < index ? 'is-past' : 'is-future'}`}
            aria-hidden={i !== index}
          >
            {slide.tag ? <div className="deck-eyebrow">{slide.tag}</div> : null}
            {slide.content}
          </div>
        ))}
      </div>

      <div className="deck-click-left" onClick={() => go(index - 1)} aria-label="Previous slide" />
      <div className="deck-click-right" onClick={() => go(index + 1)} aria-label="Next slide" />

      <div className="deck-controls">
        <button
          type="button"
          className="deck-btn"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Previous"
        >
          ◀
        </button>
        <div className="deck-counter">
          {index + 1} / {total}
        </div>
        <button
          type="button"
          className="deck-btn"
          onClick={() => go(index + 1)}
          disabled={index === total - 1}
          aria-label="Next"
        >
          ▶
        </button>
        <a className="deck-exit" href="/">
          ← back to site
        </a>
      </div>

      <div className="deck-print">
        {slides.map((slide) => (
          <div key={slide.id} className="deck-slide deck-slide-print">
            {slide.tag ? <div className="deck-eyebrow">{slide.tag}</div> : null}
            {slide.content}
          </div>
        ))}
      </div>
    </div>
  );
}
