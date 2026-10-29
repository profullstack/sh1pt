import { coinpayConfig } from '@/lib/coinpay-signin';

// "Sign in with CoinPay": CoinPay is the fleet's master account, so it is
// offered first. Rendered only when the deployment has a CoinPay client.
export function CoinpaySignIn({ label = 'Sign in with CoinPay', next = '/dashboard' }: { label?: string; next?: string }) {
  if (!coinpayConfig()) return null;
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <a
        className="btn"
        href={`/api/v1/coinpay/oauth/start?next=${encodeURIComponent(next)}`}
        style={{ display: 'block', textAlign: 'center', width: '100%' }}
      >
        {label}
      </a>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem', textAlign: 'center' }}>
        or use your email below
      </p>
    </div>
  );
}

const COINPAY_ERRORS: Record<string, string> = {
  coinpay_bad_state: "That CoinPay sign-in didn't start in this browser. Try again.",
  coinpay_expired: 'That CoinPay sign-in expired or was already used. Try again.',
  coinpay_wrong_session: 'Sign in to the account you want to connect, then try again.',
  coinpay_cancelled: 'CoinPay sign-in was cancelled.',
  coinpay_failed: "CoinPay sign-in couldn't be completed. Try again.",
  coinpay_session: "Couldn't start your session after CoinPay. Try again.",
  coinpay_off: 'Sign in with CoinPay is not available right now.',
};

export function coinpayLoginError(code: string | undefined): string | null {
  return code ? (COINPAY_ERRORS[code] ?? null) : null;
}
