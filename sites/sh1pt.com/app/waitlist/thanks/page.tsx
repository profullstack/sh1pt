export default async function Thanks({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { code } = await searchParams;
  const referralUrl = code ? `https://sh1pt.com/r/${code}` : 'https://sh1pt.com/';
  return (
    <main>
      <section>
        <div className="container" style={{ maxWidth: 640 }}>
          <h1>You're in. 🎉</h1>
          <p className="muted">
            We'll email you the prepay link the moment checkout is live — CoinPay (BTC/ETH/USDC/SOL) or card. Your $244/yr price is held for 14 days from that email.
          </p>
          {code ? (
            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div className="muted" style={{ fontSize: '0.85rem' }}>Your referral link — $50 credit per paid signup</div>
              <code style={{ fontSize: '1.1rem', display: 'block', wordBreak: 'break-all', marginTop: '0.5rem' }}>{referralUrl}</code>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
