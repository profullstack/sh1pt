import { sendLoginLink } from './actions';

export const metadata = {
  title: 'Sign in to sh1pt',
  description: 'Magic-link sign-in for your sh1pt account.',
};

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const error = params.error;

  return (
    <main>
      <section>
        <div className="container" style={{ maxWidth: 480 }}>
          <h1>Sign in</h1>
          <p className="muted">
            Enter your email. We'll send a one-click magic link — no password to remember.
          </p>

          <form action={sendLoginLink} style={{ marginTop: '1.5rem' }}>
            <label>
              <div className="muted" style={{ fontSize: '0.85rem' }}>Email</div>
              <input
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@example.com"
                style={{ width: '100%', padding: '0.8rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)' }}
              />
            </label>
            <button className="btn" type="submit" style={{ marginTop: '1rem', width: '100%' }}>
              Send me a sign-in link
            </button>
          </form>

          {error === 'email' ? (
            <p style={{ color: 'var(--warn, #ff6a3d)', fontSize: '0.9rem', marginTop: '1rem' }}>
              That email doesn't look right — try again.
            </p>
          ) : null}
          {error === 'send' ? (
            <p style={{ color: 'var(--warn, #ff6a3d)', fontSize: '0.9rem', marginTop: '1rem' }}>
              Couldn't send the email just now. Try again in a moment or email <a href="mailto:hello@sh1pt.com">hello@sh1pt.com</a>.
            </p>
          ) : null}

          <p className="muted" style={{ fontSize: '0.85rem', marginTop: '2rem' }}>
            New here? <a href="/waitlist">Join the waitlist</a> and lock in $244/yr for life.
          </p>
        </div>
      </section>
    </main>
  );
}
