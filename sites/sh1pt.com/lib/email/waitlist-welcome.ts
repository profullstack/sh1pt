import { sendMail } from './transport';

// Branded welcome email sent when a user joins the waitlist. Keeps the
// sh1pt palette (dark bg, white body, lime accent) and gives the user
// two one-click actions: their referral link + the status page.
//
// Plain-text fallback is generated automatically by the HTML-to-text
// portion; we also include an explicit `text` version for clients that
// don't render HTML.

export interface WaitlistWelcomeArgs {
  to: string;
  handle: string | null;
  referralUrl: string;       // https://sh1pt.com/r/<code>
  thanksUrl: string;         // https://sh1pt.com/waitlist/thanks?code=<code>
}

export async function sendWaitlistWelcome({ to, handle, referralUrl, thanksUrl }: WaitlistWelcomeArgs): Promise<void> {
  const greeting = handle ? `Hey ${handle},` : 'Hey there,';

  await sendMail({
    to,
    subject: "You're on the sh1pt waitlist — here's your referral link",
    text: [
      greeting,
      '',
      "You're in. We'll email you the prepay link the moment checkout is live — CoinPay",
      '(BTC / ETH / USDC / SOL) or card. Your $244/yr price stays locked for 14 days',
      'from that email.',
      '',
      'Your personal referral link — $50 credit per paid signup, tiered bonuses at 3 / 10 / 25:',
      `  ${referralUrl}`,
      '',
      `Status page: ${thanksUrl}`,
      '',
      '— sh1pt',
      'https://sh1pt.com',
    ].join('\n'),
    html: renderHtml({ greeting, referralUrl, thanksUrl }),
    headers: {
      'List-Unsubscribe': `<mailto:unsubscribe@sh1pt.com?subject=unsubscribe-${encodeURIComponent(to)}>`,
    },
  });
}

function renderHtml({ greeting, referralUrl, thanksUrl }: { greeting: string; referralUrl: string; thanksUrl: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Welcome to the sh1pt waitlist</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">
    You're in. Share your referral link — $50 credit per paid signup.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0a0a0a;padding:40px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#111111;border:1px solid #262626;border-radius:12px;overflow:hidden">
          <tr>
            <td style="padding:32px 32px 0 32px">
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:-0.02em;color:#f5f5f4">
                sh1pt<span style="color:#c2ff3d">.</span>
              </div>
              <div style="height:3px;width:56px;background:#c2ff3d;margin-top:10px;border-radius:2px"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px 32px">
              <p style="margin:0 0 12px 0;color:#d6d3d1;font-size:16px;line-height:1.6">${greeting}</p>
              <h1 style="margin:0 0 16px 0;font-size:28px;font-weight:600;line-height:1.2;color:#f5f5f4;letter-spacing:-0.02em">
                You're on the list.
              </h1>
              <p style="margin:0 0 20px 0;color:#a3a3a3;font-size:15px;line-height:1.6">
                We'll email you the prepay link the moment checkout is live — CoinPay
                (BTC / ETH / USDC / SOL) or card. Your <strong style="color:#f5f5f4">$244/yr</strong>
                price stays locked for 14 days from that email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px 32px">
              <div style="background:#141414;border:1px solid #1f1f1f;border-radius:10px;padding:20px">
                <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#737373">
                  Your referral link
                </div>
                <div style="margin-top:8px;font-size:14px;color:#a3a3a3;line-height:1.5">
                  <strong style="color:#c2ff3d">$50 credit</strong> per paid signup.
                  Tiered bonuses: <strong style="color:#f5f5f4">+$150</strong> at 3,
                  <strong style="color:#f5f5f4">+$600</strong> at 10,
                  <strong style="color:#f5f5f4">+$2,000</strong> at 25.
                </div>
                <a href="${escapeAttr(referralUrl)}" style="display:inline-block;margin-top:14px;padding:12px 18px;background:#c2ff3d;color:#0a0a0a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px">
                  Copy my referral link →
                </a>
                <div style="margin-top:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#737373;word-break:break-all">
                  ${escapeHtml(referralUrl)}
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px">
              <a href="${escapeAttr(thanksUrl)}" style="color:#c2ff3d;font-size:14px;text-decoration:none">
                Visit your status page →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 32px 32px;border-top:1px solid #262626;background:#0d0d0d">
              <div style="font-size:12px;color:#737373;line-height:1.6">
                <a href="https://sh1pt.com" style="color:#7dd3fc;text-decoration:none">sh1pt.com</a>
                · <a href="https://github.com/profullstack/sh1pt" style="color:#7dd3fc;text-decoration:none">source</a>
                · Build. Promote. Scale. Iterate…
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]!);
}
function escapeAttr(s: string): string { return escapeHtml(s); }
