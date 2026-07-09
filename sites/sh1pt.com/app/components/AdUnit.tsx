/**
 * CrawlProof ad slot, rendered inside page content (never at the tail of
 * <body>, which puts it below the footer). The global ad.js loader in the
 * root layout fills every [data-cp-ad] slot in place with a 300x250 iframe.
 */
const CP_AD_SLOT = '6faee067-68a2-40ef-aa20-2065bb306f4c';

export default function AdUnit() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        margin: '2.5rem 0',
      }}
    >
      <span
        className="muted"
        style={{
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.35rem',
        }}
      >
        Advertisement
      </span>
      <div data-cp-ad="" data-slot={CP_AD_SLOT} data-format="banner_300x250" />
    </div>
  );
}
