// WebSub publisher mode. The blog RSS feed declares an external hub
// (Google's pubsubhubbub by default; override via WEBSUB_HUB), and the
// webhook pings the hub after every successful article upsert so
// aggregators get the new post within seconds.
//
// We're not implementing the hub role itself — that's a separate
// service (subscription store, verification GET callback, fan-out
// queue, retries). Spec: https://www.w3.org/TR/websub/

const DEFAULT_HUB = 'https://pubsubhubbub.appspot.com/';

export function webSubHubUrl(): string {
  return process.env.WEBSUB_HUB?.trim() || DEFAULT_HUB;
}

const PING_TIMEOUT_MS = 5000;

export async function pingWebSubHub(feedUrl: string): Promise<void> {
  const hubUrl = webSubHubUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(hubUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'hub.mode': 'publish',
        'hub.url': feedUrl,
      }).toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[websub] hub ${hubUrl} responded ${res.status} for ${feedUrl}`,
      );
    }
  } catch (err) {
    console.warn('[websub] hub ping failed:', err);
  } finally {
    clearTimeout(timer);
  }
}
