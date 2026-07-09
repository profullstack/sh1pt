export const metadata = {
  title: "sh1pt — check your email",
};

export default async function CheckEmail({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { email } = await searchParams;
  return (
    <main>
      <section>
        <div className="container" style={{ maxWidth: 640 }}>
          <h1>Check your email 📬</h1>
          <p className="muted">
            We sent a magic sign-in link{email ? <> to <strong style={{ color: 'var(--fg)' }}>{email}</strong></> : null}. Click it and you'll land on your sh1pt dashboard — your referral link, a live count of friends you've invited, and the prepay button once checkout opens.
          </p>
          <p className="muted" style={{ fontSize: '0.9rem', marginTop: '1.5rem' }}>
            The link expires in 1 hour and can only be used once.
          </p>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Didn't get it? Check spam, then try <a href="/waitlist">/waitlist</a> again. If the issue persists, email <a href="mailto:hello@sh1pt.com">hello@sh1pt.com</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
