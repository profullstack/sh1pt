import type { Metadata } from 'next';
import CopyableCommand from '../components/CopyableCommand';

export const metadata: Metadata = {
  title: 'Getting started — sh1pt',
  description:
    'Install sh1pt, sign in, and run your first build → promote → scale → iterate loop.',
};

export default function GettingStartedPage() {
  return (
    <main>
      <section>
        <div className="container">
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Getting started
          </div>
          <h1>From zero to shipped, in four verbs.</h1>
          <p className="muted" style={{ maxWidth: 780 }}>
            sh1pt is a single CLI that fans your project out to every store, ad network, and cloud you care about. This page walks through the first install and the four-verb loop that drives everything.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>1. Install the CLI</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            The shell installer picks the first available JS runtime it finds (bun → pnpm → aube → npm → deno) and installs the published <code>@profullstack/sh1pt</code> package globally.
          </p>
          <div style={{ maxWidth: 640, display: 'grid', gap: '0.75rem' }}>
            <CopyableCommand label="One-liner (shell)" command="curl -fsSL https://sh1pt.com/install.sh | sh" />
            <CopyableCommand label="bun" command="bun i -g @profullstack/sh1pt" />
            <CopyableCommand label="pnpm" command="pnpm add -g @profullstack/sh1pt" />
            <CopyableCommand label="npm" command="npm i -g @profullstack/sh1pt" />
            <CopyableCommand label="deno" command="deno install -g -A -f -n sh1pt npm:@profullstack/sh1pt" />
          </div>
          <p className="muted" style={{ marginTop: '1.25rem', fontSize: '0.9rem' }}>
            Confirm the install with <code>sh1pt --help</code>. Update later with <code>sh1pt update</code>; remove with <code>sh1pt remove</code>.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>2. Sign in</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            <code>sh1pt login</code> pairs the CLI with your sh1pt.com account so the cloud tier can run the build farm, store-submission polling, and credentials vault on your behalf. Self-host core works without an account; cloud features need it.
          </p>
          <div style={{ maxWidth: 640 }}>
            <CopyableCommand command="sh1pt login" />
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>3. The four verbs</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Every workflow in sh1pt collapses into four commands. Run them from the root of any project — sh1pt detects the framework and reads <code>sh1pt.config.ts</code> if present.
          </p>

          <div className="grid grid-3" style={{ marginTop: '1.5rem' }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>build</h3>
              <p className="muted">Compile artifacts for every target your project declares — web, iOS, Android, desktop, CLI, container, npm package, browser extension, and more.</p>
              <CopyableCommand command="sh1pt build" />
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>promote</h3>
              <p className="muted">Publish to stores, registries, and CDNs; launch ads; trigger cold-email + Product Hunt + podcast pitches; print swag. Anything that gets users.</p>
              <CopyableCommand command="sh1pt promote" />
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>scale</h3>
              <p className="muted">Provision VPS / GPU, wire up DNS, run rollouts, enforce hard cost ceilings. Cloud infra on demand without leaving the terminal.</p>
              <CopyableCommand command="sh1pt scale" />
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>iterate</h3>
              <p className="muted">Pull metrics, hand them to an agent, review proposed fixes, ship the winners. The loop that closes idea → distribution → feedback.</p>
              <CopyableCommand command="sh1pt iterate" />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>4. Drop into an existing project</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            Every verb accepts <code>--from</code> so you can point sh1pt at an existing codebase, URL, or doc and skip the scaffold. A few common entry points:
          </p>
          <div style={{ maxWidth: 640, display: 'grid', gap: '0.75rem' }}>
            <CopyableCommand label="Promote from a git repo" command="sh1pt promote --from git@github.com:you/app.git" />
            <CopyableCommand label="Build from a local path" command="sh1pt build --from ./apps/web" />
            <CopyableCommand label="Iterate from a live URL" command="sh1pt iterate --from https://example.com" />
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>5. Secrets &amp; config</h2>
          <p className="muted" style={{ maxWidth: 780 }}>
            sh1pt prompts for credentials the first time an adapter needs them and stores them in the encrypted vault — no <code>.env</code> juggling. Inspect or rotate at any time:
          </p>
          <div style={{ maxWidth: 640, display: 'grid', gap: '0.75rem' }}>
            <CopyableCommand label="List stored secrets" command="sh1pt secrets ls" />
            <CopyableCommand label="Set a secret manually" command="sh1pt secrets set OPENAI_API_KEY" />
            <CopyableCommand label="Read or change config" command="sh1pt config get" />
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <h2>Where to go next</h2>
          <ul className="muted" style={{ paddingLeft: '1.2rem', maxWidth: 780 }}>
            <li><a href="https://github.com/profullstack/sh1pt">Browse the source on GitHub</a> — adapters live under <code>packages/</code>.</li>
            <li><a href="/#pricing">Lock in early-access pricing</a> ($244/yr, lifetime price-lock).</li>
            <li><a href="/investors">Read the investor brief</a> if you want the why behind the project.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
