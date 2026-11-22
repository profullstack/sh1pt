import { createGateway } from "@profullstack/x402-gateway";
import { x402Proxy } from "@profullstack/x402-gateway/next";

/**
 * Sells crawl access to AI training crawlers (GPTBot, ClaudeBot, CCBot,
 * meta-externalagent, Bytespider, Applebot-Extended, ...) by the day over
 * x402, settled by CoinPay in USDC. People, Googlebot and the retrieval
 * crawlers behind AI search pass through untouched.
 *
 * Runs inside the middleware, so nothing here may import Node-only modules.
 * The env is read through a non-literal key on purpose: Next inlines
 * `process.env.NAME` at build time, and these are runtime secrets. Without
 * COINPAY_X402_KEY and CRAWL_PAY_TO the gateway still answers training
 * crawlers with 402, just with an empty offer.
 */
const env = (name: string) => process.env[name];

/**
 * Names this app on the gateway's CoinPay calls (x402 verify/settle,
 * checkout): every fleet app reaches CoinPay from one IP. 0.13.x has no
 * userAgent option, so it goes in through the gateway's `fetch`.
 */
const APP_VERSION = env("npm_package_version");
const COINPAY_UA = `sh1pt.com${APP_VERSION ? `/${APP_VERSION}` : ""} (+https://sh1pt.com)`;
const coinpayFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  if (!headers.has("user-agent")) headers.set("user-agent", COINPAY_UA);
  return fetch(input, { ...init, headers });
};

export const gateway = createGateway({
  // Hubs read the OpenAccess descriptor with no cookie and no browser headers.
  openPaths: ['/.well-known/openaccess.json'],
  siteUrl: env("SITE_URL") || env("NEXT_PUBLIC_SITE_URL") || "https://sh1pt.com",
  siteName: "sh1pt",
  coinpay: { apiKey: env("COINPAY_X402_KEY") },
  payTo: env("CRAWL_PAY_TO"),
  contact: "mailto:support@sh1pt.com",
  fetch: coinpayFetch,
});

/** Resolves to a Response for a refused crawler, or undefined to carry on. */
export const gate = x402Proxy(gateway);
