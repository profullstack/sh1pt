import Script from 'next/script';

const CRAWLPROOF_PROJECT_ID = '475e7e62-b048-44da-90b4-746d1ba512d2';

export default function CrawlproofStats() {
  return (
    <Script
      id="crawlproof-stats"
      data-site={CRAWLPROOF_PROJECT_ID}
      src="https://crawlproof.com/stats.js"
      strategy="afterInteractive"
    />
  );
}
