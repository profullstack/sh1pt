'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './deck.css';

type Slide = {
  id: string;
  label: string;
  bg?: 'ink' | 'paper' | 'accent';
  dotgrid?: boolean;
  render: (meta: { num: string; total: number }) => ReactNode;
};

const Chrome = ({ num, label }: { num: string; label: string }) => (
  <div className="chrome">
    <div className="brand">
      <span className="brand-dot" />
      <span>sh1pt</span>
    </div>
    <div className="meta">
      <div className="num">{num}</div>
      <div>{label}</div>
    </div>
  </div>
);

const slides: Slide[] = [
  {
    id: 'title',
    label: 'Investor Deck · 2026',
    dotgrid: true,
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="Investor Deck · 2026" />
        <div className="content" style={{ justifyContent: 'space-between' }}>
          <div>
            <span className="eyebrow">Profullstack, Inc. · Seed round · 2026</span>
          </div>
          <div>
            <h1 className="title-xxl" style={{ marginBottom: '1.5rem' }}>
              sh1pt<span className="accent-text">.</span>
            </h1>
            <p
              className="body-lg"
              style={{ fontFamily: 'var(--font-display)', maxWidth: '70ch', fontSize: 'clamp(1.4rem, 2.5vw, 2.5rem)', lineHeight: 1.25, letterSpacing: '-0.02em' }}
            >
              <span>Build.</span>{' '}
              <span style={{ color: 'var(--ink-4)' }}>Promote.</span>{' '}
              <span style={{ color: 'var(--ink-4)' }}>Scale.</span>{' '}
              <span style={{ color: 'var(--ink-4)' }}>
                Iterate<span className="cursor" style={{ background: 'var(--accent)' }} />
              </span>
            </p>
            <div className="pill-row">
              <span className="pill">
                <span className="pill-dot" />
                Early access · $244/yr locked
              </span>
              <span className="pill">MIT-licensed core</span>
              <span className="pill">Agent-first API</span>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'premise',
    label: 'The premise',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="The premise" />
        <div className="content" style={{ justifyContent: 'center' }}>
          <span className="eyebrow">The premise</span>
          <h2 className="title-xl" style={{ maxWidth: '22ch' }}>
            <span className="strike">Writing software</span> is no longer the bottleneck.
            <br />
            <span className="accent-text">Publishing it</span> is.
          </h2>
          <div className="era-row">
            <div>
              <div className="era-year">2018</div>
              <p className="body-lg">
                A team of 12 shipped a consumer app in nine months. The hard part was the code.
              </p>
            </div>
            <div className="era-divider" aria-hidden />
            <div>
              <div className="era-year accent-text">2026</div>
              <p className="body-lg">
                An AI agent generates that app in an afternoon — and then{' '}
                <span style={{ color: 'var(--warn)' }}>stalls for three weeks</span> trying to
                publish it.
              </p>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'problem',
    label: 'Problem',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="Problem" />
        <div className="content">
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: '2rem', marginBottom: '2rem' }}>
            <div>
              <span className="eyebrow">Problem</span>
              <h2 className="title-lg">
                Shipping means learning
                <br />
                <span className="accent-text">30+ dashboards.</span>
              </h2>
            </div>
            <p className="body" style={{ maxWidth: '42ch', textAlign: 'right' }}>
              Every surface has its own API, review queue, credential model, and quirks. Every one
              can silently reject a release.
            </p>
          </div>
          <div className="chip-grid">
            {[
              'App Store',
              'Play Console',
              'Chrome Web Store',
              'Homebrew tap',
              'npm registry',
              'Docker Hub',
              'JSR',
              'Cloudflare Pages',
              'Fly.io',
              'Railway',
              'Vercel',
              'RunPod',
              'DigitalOcean',
              'Vultr · Hetzner',
              'TestFlight',
              'F-Droid',
              'Steam Deck',
              'Meta Quest',
              'Vision Pro',
              'Apple TV · Roku',
              'GitHub Releases',
              'Product Hunt',
              'Reddit Ads',
              'Meta Ads',
              'TikTok Ads',
              'Google Ads',
              'X · LinkedIn',
              'Apple Search',
              'Stripe',
              'CoinPay',
              'Supabase auth',
              'Resend',
              'Listen Notes',
              'Printful swag',
            ].map((t) => (
              <div key={t} className="chip-cell">
                <span className="bullet" />
                {t}
              </div>
            ))}
            <div className="chip-cell is-dashed">
              <span className="bullet" />
              …and 12 more
            </div>
          </div>
          <div className="problem-footer">
            <span className="arrow">→</span>
            <span>
              A launch that takes a <span style={{ color: 'var(--ink)' }}>human team weeks</span> is
              a wall that stops <span style={{ color: 'var(--ink)' }}>every AI agent</span> on the
              first submission.
            </span>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'why-now',
    label: 'Why now',
    bg: 'paper',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="Why now" />
        <div className="content" style={{ justifyContent: 'center' }}>
          <span className="eyebrow">Why now</span>
          <h2 className="title-xl" style={{ maxWidth: '22ch', color: '#0a0a0a' }}>
            Agents ship code at <span className="serif" style={{ fontWeight: 400 }}>100×</span>
            <br />
            human velocity. They publish at{' '}
            <span className="mono" style={{ color: '#ff3d3d' }}>
              0×
            </span>
            .
          </h2>
          <div className="metric-row">
            <div className="metric">
              <div className="n">42M</div>
              <div className="l">Devs using AI coding assistants</div>
            </div>
            <div className="metric">
              <div className="n">~0</div>
              <div className="l">Can publish to every major surface</div>
            </div>
            <div className="metric">
              <div className="n" style={{ color: '#0a0a0a' }}>
                $180B
              </div>
              <div className="l">Annual app-distribution tax, today</div>
            </div>
          </div>
          <p
            className="mono"
            style={{
              marginTop: 'clamp(2.5rem, 5vw, 5rem)',
              color: '#737373',
              fontSize: 'clamp(0.8rem, 1vw, 1rem)',
            }}
          >
            // whoever owns the last mile between a generated artifact and a paying user owns the
            next platform.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'solution',
    label: 'Solution',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="Solution" />
        <div className="content">
          <span className="eyebrow">Solution</span>
          <h2 className="title-lg" style={{ marginBottom: '2.5rem' }}>
            One manifest. <span className="accent-text">Every surface.</span>
          </h2>
          <div className="solution-row">
            <div className="term">
              <div className="term-header">
                <div className="lights">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="title">~/my-app — sh1pt v0.9</div>
                <div style={{ width: 56 }} />
              </div>
              <div className="term-body">
                <div className="line">
                  <span className="prompt">
                    <span className="user">you</span>
                    <span className="sep">@</span>macbook <span className="sep">~/my-app $</span>
                  </span>{' '}
                  <span className="cmd">
                    <span className="kw">sh1pt</span> <span className="arg">build</span>
                  </span>
                </div>
                <div className="line out out-ok">
                  compiled 7 artifacts (ios, android, macos, linux, web, wasm, docker)
                </div>
                <div className="spacer" />
                <div className="line">
                  <span className="prompt">
                    <span className="user">you</span>
                    <span className="sep">@</span>macbook <span className="sep">~/my-app $</span>
                  </span>{' '}
                  <span className="cmd">
                    <span className="kw">sh1pt</span> <span className="arg">promote</span> --campaign launch.yml
                  </span>
                </div>
                <div className="line out out-ok">
                  submitted to 31 surfaces · ads live on 9 networks · 42 podcast pitches sent
                </div>
                <div className="spacer" />
                <div className="line">
                  <span className="prompt">
                    <span className="user">you</span>
                    <span className="sep">@</span>macbook <span className="sep">~/my-app $</span>
                  </span>{' '}
                  <span className="cmd">
                    <span className="kw">sh1pt</span> <span className="arg">scale</span> --cap $200/day
                  </span>
                </div>
                <div className="line out out-ok">
                  3 regions · round-robin DNS · A100 pool w/ hard ceiling
                </div>
                <div className="spacer" />
                <div className="line">
                  <span className="prompt">
                    <span className="user">you</span>
                    <span className="sep">@</span>macbook <span className="sep">~/my-app $</span>
                  </span>{' '}
                  <span className="cmd">
                    <span className="kw">sh1pt</span> <span className="arg">iterate</span>
                  </span>
                </div>
                <div className="line out out-pending">
                  agent watching metrics… proposing fix #1 of 4
                </div>
                <div>
                  <span className="cursor" />
                </div>
              </div>
            </div>
            <div className="verb-stack">
              <div className="verb-card">
                <div className="verb-tag">01 — build</div>
                <div className="verb-label">Compile every artifact, in parallel.</div>
              </div>
              <div className="verb-card">
                <div className="verb-tag">02 — promote</div>
                <div className="verb-label">Publish · ads · swag · investors · podcasts.</div>
              </div>
              <div className="verb-card">
                <div className="verb-tag">03 — scale</div>
                <div className="verb-label">Cloud on demand, with cost ceilings.</div>
              </div>
              <div className="verb-card">
                <div className="verb-tag">04 — iterate</div>
                <div className="verb-label">Agent closes the loop, forever.</div>
              </div>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'architecture',
    label: 'Architecture',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="Architecture" />
        <div className="content">
          <span className="eyebrow">Architecture</span>
          <h2 className="title-lg" style={{ marginBottom: '3rem' }}>
            From one file to <span className="accent-text">global presence.</span>
          </h2>
          <svg viewBox="0 0 1600 560" className="arch-svg" preserveAspectRatio="xMidYMid meet">
            <defs>
              <marker
                id="arr"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="#c2ff3d" />
              </marker>
            </defs>
            <g transform="translate(40, 180)">
              <rect x="0" y="0" width="260" height="200" rx="14" fill="#141414" stroke="#262626" />
              <text x="20" y="36" fontFamily="inherit" fontSize="13" fill="#737373" letterSpacing="1">
                SH1PT.YML
              </text>
              <text x="20" y="78" fontFamily="inherit" fontSize="16" fill="#f5f5f4">
                name: my-app
              </text>
              <text x="20" y="104" fontFamily="inherit" fontSize="16" fill="#f5f5f4">
                targets: <tspan fill="#c2ff3d">all</tspan>
              </text>
              <text x="20" y="130" fontFamily="inherit" fontSize="16" fill="#f5f5f4">
                ads: <tspan fill="#c2ff3d">all</tspan>
              </text>
              <text x="20" y="156" fontFamily="inherit" fontSize="16" fill="#f5f5f4">
                infra: <tspan fill="#7dd3fc">auto</tspan>
              </text>
              <text x="20" y="182" fontFamily="inherit" fontSize="16" fill="#f5f5f4">
                cap: <tspan fill="#ff6a3d">$200/d</tspan>
              </text>
            </g>
            <g transform="translate(420, 140)">
              <rect x="0" y="0" width="760" height="280" rx="16" fill="#0d0d0d" stroke="#262626" />
              <text x="30" y="34" fontFamily="inherit" fontSize="13" fill="#737373" letterSpacing="1">
                SH1PT CORE
              </text>
              {[
                { x: 30, n: '01', v: 'build', b: ['• artifacts', '• signing', '• policy lint'] },
                { x: 210, n: '02', v: 'promote', b: ['• stores', '• ads / PR', '• outreach'] },
                { x: 390, n: '03', v: 'scale', b: ['• infra', '• DNS', '• cost caps'] },
                { x: 570, n: '04', v: 'iterate', b: ['• metrics', '• agent PRs', '• re-ship'] },
              ].map((c) => (
                <g key={c.n} transform={`translate(${c.x}, 60)`}>
                  <rect x="0" y="0" width="160" height="180" rx="10" fill="#141414" stroke="#1f1f1f" />
                  <text x="16" y="32" fontFamily="inherit" fontSize="12" fill="#c2ff3d" letterSpacing="1">
                    {c.n}
                  </text>
                  <text x="16" y="60" fontFamily="inherit" fontSize="22" fill="#f5f5f4" fontWeight="500">
                    {c.v}
                  </text>
                  {c.b.map((b, i) => (
                    <text key={b} x="16" y={90 + i * 20} fontFamily="inherit" fontSize="12" fill="#a3a3a3">
                      {b}
                    </text>
                  ))}
                </g>
              ))}
            </g>
            <g transform="translate(1260, 40)">
              <text x="0" y="20" fontFamily="inherit" fontSize="13" fill="#737373" letterSpacing="1">
                SURFACES
              </text>
              {[
                { y: 36, label: '▸ 7 app stores' },
                { y: 78, label: '▸ 4 package registries' },
                { y: 120, label: '▸ 9 ad networks' },
                { y: 162, label: '▸ 6 cloud providers' },
                { y: 204, label: '▸ 5 growth channels' },
              ].map((r) => (
                <g key={r.y}>
                  <rect x="0" y={r.y} width="300" height="34" rx="8" fill="#141414" stroke="#262626" />
                  <text x="16" y={r.y + 22} fontFamily="inherit" fontSize="15" fill="#f5f5f4">
                    {r.label}
                  </text>
                </g>
              ))}
              <rect x="0" y="246" width="300" height="34" rx="8" fill="#c2ff3d" stroke="#c2ff3d" />
              <text x="16" y="268" fontFamily="inherit" fontSize="15" fill="#0a0a0a" fontWeight="500">
                ∑ 31 + growing
              </text>
            </g>
            <line x1="300" y1="280" x2="420" y2="280" stroke="#c2ff3d" strokeWidth="2" markerEnd="url(#arr)" />
            {[76, 136, 196, 256, 316, 376].map((y) => (
              <line key={y} x1="1180" y1="280" x2="1260" y2={y} stroke="#c2ff3d" strokeWidth="2" markerEnd="url(#arr)" />
            ))}
            <path
              d="M 1180 420 C 1180 520, 420 520, 420 420"
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="2"
              strokeDasharray="6 6"
              markerEnd="url(#arr)"
              opacity="0.7"
            />
            <text x="750" y="540" fontFamily="inherit" fontSize="14" fill="#7dd3fc" letterSpacing="1">
              metrics → agent → next ship
            </text>
          </svg>
        </div>
      </>
    ),
  },
  {
    id: 'surfaces',
    label: 'The moat',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="The moat" />
        <div className="content">
          <div className="surface-head">
            <div>
              <span className="eyebrow">The moat</span>
              <h2 className="title-lg">
                31 surfaces live.
                <br />
                <span style={{ color: 'var(--ink-4)' }}>Each one took us months.</span>
              </h2>
            </div>
            <div>
              <div className="surface-count-n">31</div>
              <div className="surface-count-l">shipping today</div>
            </div>
          </div>
          <div className="surface-grid">
            <div className="surface-col">
              <div className="surface-col-h">Native stores</div>
              {[
                ['done', 'iOS App Store'],
                ['done', 'Google Play'],
                ['done', 'Mac App Store'],
                ['done', 'Microsoft Store'],
                ['live', 'Meta Quest'],
                ['live', 'Vision Pro'],
                ['', 'Steam · Steam Deck'],
                ['', 'Apple TV · Roku · Fire TV'],
              ].map(([s, t]) => (
                <div key={t} className={`chip-cell ${s === 'done' ? 'is-done' : s === 'live' ? 'is-live' : ''}`}>
                  <span className="bullet" />
                  {t}
                </div>
              ))}
            </div>
            <div className="surface-col">
              <div className="surface-col-h">Registries · Web</div>
              {[
                ['done', 'npm'],
                ['done', 'JSR'],
                ['done', 'Homebrew tap'],
                ['done', 'Docker Hub'],
                ['done', 'F-Droid'],
                ['done', 'Chrome Web Store'],
                ['live', 'PWA / web / wasm'],
                ['', 'Firefox · Edge add-ons'],
              ].map(([s, t]) => (
                <div key={t} className={`chip-cell ${s === 'done' ? 'is-done' : s === 'live' ? 'is-live' : ''}`}>
                  <span className="bullet" />
                  {t}
                </div>
              ))}
            </div>
            <div className="surface-col">
              <div className="surface-col-h">Cloud · infra</div>
              {[
                ['done', 'Cloudflare'],
                ['done', 'Fly.io'],
                ['done', 'Railway'],
                ['done', 'Vercel'],
                ['live', 'RunPod GPUs'],
                ['live', 'DigitalOcean'],
                ['', 'Hetzner · Vultr'],
                ['', 'AWS · GCP (roadmap)'],
              ].map(([s, t]) => (
                <div key={t} className={`chip-cell ${s === 'done' ? 'is-done' : s === 'live' ? 'is-live' : ''}`}>
                  <span className="bullet" />
                  {t}
                </div>
              ))}
            </div>
            <div className="surface-col">
              <div className="surface-col-h">Promo · commerce</div>
              {[
                ['done', 'Reddit · Meta · TikTok Ads'],
                ['done', 'Google · YouTube Ads'],
                ['done', 'X · LinkedIn · MS Ads'],
                ['done', 'Apple Search Ads'],
                ['done', 'Product Hunt'],
                ['live', 'Stripe · CoinPay'],
                ['live', 'Resend · Listen Notes'],
                ['', 'Printful swag'],
              ].map(([s, t]) => (
                <div key={t} className={`chip-cell ${s === 'done' ? 'is-done' : s === 'live' ? 'is-live' : ''}`}>
                  <span className="bullet" />
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div className="legend">
            <span>
              <span className="dot dot-live" /> shipping
            </span>
            <span>
              <span className="dot dot-beta" /> beta
            </span>
            <span>
              <span className="dot dot-roadmap" /> roadmap Q3
            </span>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'wedge',
    label: 'Wedge',
    bg: 'accent',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="Wedge" />
        <div className="content" style={{ justifyContent: 'center' }}>
          <span className="eyebrow">Our wedge</span>
          <h2 className="title-xl" style={{ color: '#0a0a0a', maxWidth: '20ch' }}>
            <span className="serif" style={{ fontWeight: 400 }}>
              Sell first
            </span>
            ,<br />
            build second.
          </h2>
          <p
            className="body-lg"
            style={{
              marginTop: '2rem',
              color: 'rgba(0,0,0,0.8)',
              fontFamily: 'var(--font-display)',
              maxWidth: '58ch',
            }}
          >
            Default sh1pt recipe stands up a waitlist, investor page, crypto-prepay checkout, and a
            referral program — <span className="strong-pen">before a line of product code exists</span>
            .
          </p>
          <div className="wedge-row">
            <div className="wedge-step">
              <div className="wedge-day">Day 0</div>
              <div className="wedge-title">Idea</div>
              <div className="wedge-cmd">$ sh1pt init saas</div>
            </div>
            <div className="wedge-arrow" aria-hidden>→</div>
            <div className="wedge-step">
              <div className="wedge-day">Hour 1</div>
              <div className="wedge-title">Waitlist + checkout live</div>
              <div className="wedge-cmd">landing · investors · /waitlist</div>
            </div>
            <div className="wedge-arrow" aria-hidden>→</div>
            <div className="wedge-step">
              <div className="wedge-day">Day 2</div>
              <div className="wedge-title">First revenue</div>
              <div className="wedge-cmd">BTC · ETH · USDC · SOL</div>
            </div>
            <div className="wedge-arrow" aria-hidden>→</div>
            <div className="wedge-step wedge-step-accent">
              <div className="wedge-day">Day 14</div>
              <div className="wedge-title">Then you build.</div>
              <div className="wedge-cmd">with proof it's worth building</div>
            </div>
          </div>
          <p
            className="mono"
            style={{
              marginTop: 'clamp(2rem, 4vw, 4rem)',
              color: 'rgba(0,0,0,0.65)',
              fontSize: 'clamp(0.8rem, 1vw, 1rem)',
            }}
          >
            // we ran this on ourselves — sh1pt.com was stood up by sh1pt before sh1pt existed as
            a product.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'business-model',
    label: 'Business model',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="Business model" />
        <div className="content">
          <span className="eyebrow">Business model</span>
          <h2 className="title-lg" style={{ marginBottom: '2rem' }}>
            Seat subscription. <span style={{ color: 'var(--ink-4)' }}>Self-host free.</span>
          </h2>
          <div className="price-row">
            <div className="price-card">
              <div>
                <div className="price-tag">Early access</div>
                <div className="price-num">
                  $244<span className="unit"> /yr</span>
                </div>
                <div className="price-sub">prepaid · lifetime price-lock</div>
              </div>
              <hr className="price-divider" />
              <ul className="price-bullets">
                <li>→ every future feature</li>
                <li>→ founder-level Slack</li>
                <li>→ locked-in price forever</li>
              </ul>
            </div>
            <div className="price-card featured">
              <div>
                <div className="price-tag">At launch · standard</div>
                <div className="price-num">
                  $499<span className="unit"> /yr</span>
                </div>
                <div className="price-sub">or $49 / month · cancel anytime</div>
              </div>
              <hr className="price-divider" />
              <ul className="price-bullets">
                <li>→ all features</li>
                <li>→ standard support</li>
                <li>→ annual or monthly</li>
              </ul>
            </div>
            <div className="price-card">
              <div>
                <div className="price-tag">Self-host core</div>
                <div className="price-num">$0</div>
                <div className="price-sub">MIT license · free forever</div>
              </div>
              <hr className="price-divider" />
              <ul className="price-bullets">
                <li>→ top-of-funnel driver</li>
                <li>→ trust w/ devs</li>
                <li>→ upgrade path to cloud</li>
              </ul>
            </div>
          </div>
          <div
            className="row gap-xl"
            style={{
              marginTop: '2rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}
          >
            <div className="fill" style={{ minWidth: 280 }}>
              <div
                className="mono"
                style={{
                  fontSize: 'clamp(0.65rem, 0.8vw, 0.8rem)',
                  color: 'var(--ink-4)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: '0.5rem',
                }}
              >
                Revenue capture
              </div>
              <div className="body" style={{ color: 'var(--ink)' }}>
                Cloud tier runs the build farm, credentials vault, submission polling, and policy
                linter. That's the infra devs can't self-host — and don't want to.
              </div>
            </div>
            <div className="fill" style={{ minWidth: 280 }}>
              <div
                className="mono"
                style={{
                  fontSize: 'clamp(0.65rem, 0.8vw, 0.8rem)',
                  color: 'var(--ink-4)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: '0.5rem',
                }}
              >
                Expansion
              </div>
              <div className="body" style={{ color: 'var(--ink)' }}>
                Per-agent pricing (API-driven seats), team plans, store-approval SLAs — no take-rate
                on customer revenue.
              </div>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'moat',
    label: 'Moat',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="Moat" />
        <div className="content">
          <span className="eyebrow">Why we win</span>
          <h2 className="title-lg">Why the moat compounds.</h2>
          <ul className="moat-list">
            <li>
              <strong>Every new adapter</strong> benefits every existing customer. A network of
              integrations, not a network of users — immune to social-graph churn.
            </li>
            <li>
              <strong>The policy linter</strong> gets smarter with every store rejection across the
              whole customer base. A new customer inherits thousands of learned rules on day one.
            </li>
            <li>
              <strong>Credential + identity vault</strong> is the highest-switching-cost layer. Once
              your Apple, Play, Stripe, and ad accounts live in sh1pt, moving them out is the
              blocker — not the CLI.
            </li>
            <li>
              <strong>Agent-first from day one.</strong> Every AI coding tool is a potential OEM
              channel. Cursor / Claude Code / Codex can bundle sh1pt for publishing long before a
              competitor catches up on store coverage.
            </li>
          </ul>
        </div>
      </>
    ),
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="Roadmap" />
        <div className="content">
          <span className="eyebrow">Roadmap</span>
          <h2 className="title-lg">The next 12 months.</h2>
          <div className="timeline">
            <div className="timeline-item">
              <div className="q-tag">Q1</div>
              <div>
                <strong>Hardened adapters.</strong> npm, Homebrew, iOS, Android, Chrome, Cloudflare
                Pages shipping real traffic. Prepaid waitlist live.
              </div>
            </div>
            <div className="timeline-item">
              <div className="q-tag">Q2</div>
              <div>
                <strong>Desktop + TV + XR.</strong> macOS, Windows, tvOS, Fire TV, Android TV,
                Quest, Vision Pro. First 100 paid customers.
              </div>
            </div>
            <div className="timeline-item">
              <div className="q-tag">Q3</div>
              <div>
                <strong>Promote GA.</strong> Ads + social + outreach + merch live end-to-end. First
                ARR milestone.
              </div>
            </div>
            <div className="timeline-item">
              <div className="q-tag">Q4</div>
              <div>
                <strong>Scale + iterate GA.</strong> Infra, DNS, rollouts, agent-driven metric loops
                generally available.
              </div>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'ask',
    label: 'The ask',
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="The ask" />
        <div className="content">
          <div className="ask-row">
            <div className="stack">
              <span className="eyebrow">The ask</span>
              <h2 className="title-xl" style={{ marginBottom: '1.5rem' }}>
                Raising
                <br />
                <span className="accent-text">$25k – $500k</span> checks.
              </h2>
              <p className="body-lg" style={{ maxWidth: '42ch' }}>
                Seed round open. 18 months of runway to own the last mile of software distribution
                before the window closes. Lead investors welcome.
              </p>
              <div className="uof">
                <div className="uof-head">Use of funds</div>
                <div className="uof-row">
                  <span className="uof-pct">60%</span>
                  <span>Engineering — integrations engineers owning the surface graph</span>
                </div>
                <div className="uof-row">
                  <span className="uof-pct">20%</span>
                  <span>Agent R&D — iterate loop, policy linter, cost control</span>
                </div>
                <div className="uof-row">
                  <span className="uof-pct">10%</span>
                  <span>Compliance & legal — stores push back, we push back harder</span>
                </div>
                <div className="uof-row">
                  <span className="uof-pct">10%</span>
                  <span>Build farm — macOS + Windows runners, credential vault, GTM</span>
                </div>
              </div>
            </div>
            <div className="stack gap-m">
              <div
                className="mono"
                style={{
                  fontSize: 'clamp(0.65rem, 0.8vw, 0.8rem)',
                  color: 'var(--ink-4)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                Traction · in-flight
              </div>
              <div className="traction-grid">
                <div className="traction-card">
                  <div className="traction-n accent-text">Live</div>
                  <div className="traction-l">Waitlist @ sh1pt.com</div>
                </div>
                <div className="traction-card">
                  <div className="traction-n accent-text">Open</div>
                  <div className="traction-l">First prepays closing</div>
                </div>
                <div className="traction-card">
                  <div className="traction-n">30+</div>
                  <div className="traction-l">Adapters scaffolded</div>
                </div>
                <div className="traction-card">
                  <div className="traction-n">MIT</div>
                  <div className="traction-l">Core open at profullstack/sh1pt</div>
                </div>
              </div>
              <div className="traction-note">
                <span className="accent-text">$</span> sh1pt metrics —live
                <br />
                <span style={{ color: 'var(--ink-5)' }}>—</span> waitlist live · first prepays closing
                at <span style={{ color: 'var(--ink)' }}>$244/yr</span> · we will{' '}
                <span style={{ color: 'var(--ink)' }}>not fabricate numbers</span>.
              </div>
              <a
                href="mailto:investors@sh1pt.com"
                className="mono"
                style={{
                  alignSelf: 'flex-start',
                  marginTop: '1rem',
                  padding: '0.9rem 1.5rem',
                  background: 'var(--accent)',
                  color: '#0a0a0a',
                  borderRadius: 10,
                  fontWeight: 500,
                  fontSize: 'clamp(0.9rem, 1.1vw, 1.1rem)',
                  textDecoration: 'none',
                  letterSpacing: '-0.01em',
                }}
              >
                investors@sh1pt.com →
              </a>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'close',
    label: 'Thank you',
    dotgrid: true,
    render: ({ num, total }) => (
      <>
        <Chrome num={`${num} / ${total}`} label="Thank you" />
        <div className="content" style={{ justifyContent: 'space-between' }}>
          <div>
            <span className="eyebrow">Profullstack, Inc. · 2026</span>
          </div>
          <div>
            <h2 className="title-xxl" style={{ fontSize: 'clamp(2.75rem, 7vw, 7rem)', lineHeight: 0.96 }}>
              The single command
              <br />
              between an idea and
              <br />
              <span className="accent-text">global distribution.</span>
            </h2>
            <div className="close-contacts">
              <div>
                <div className="close-label">Contact</div>
                <div className="close-val">investors@sh1pt.com</div>
              </div>
              <div>
                <div className="close-label">Source</div>
                <div className="close-val">github.com/profullstack/sh1pt</div>
              </div>
              <div>
                <div className="close-label">Prepay</div>
                <div className="close-val">sh1pt.com · $244/yr</div>
              </div>
              <div>
                <div className="close-label">Say hi</div>
                <div className="close-val accent-text">
                  $ sh1pt invest
                  <span className="cursor" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
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
        {slides.map((slide, i) => {
          const pad = (n: number) => String(n).padStart(2, '0');
          const num = `${pad(i + 1)} / ${pad(total)}`;
          return (
            <div
              key={slide.id}
              className={`deck-slide ${i === index ? 'is-active' : ''}`}
              aria-hidden={i !== index}
            >
              <div className={`slide bg-${slide.bg ?? 'ink'}`}>
                {slide.dotgrid && <div className="dotgrid" />}
                {slide.render({ num: num.split(' / ')[0], total })}
              </div>
            </div>
          );
        })}
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
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
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
    </div>
  );
}
