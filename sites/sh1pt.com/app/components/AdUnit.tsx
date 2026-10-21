/**
 * CrawlProof ad slot, rendered inside page content (never at the tail of
 * <body>, which puts it below the footer). The global ad.js loader in the
 * root layout fills every [data-cp-ad] slot in place. Low profile: a single
 * thin text_link line (it carries its own "Sponsored" mark). Never on the
 * homepage; at most one per page.
 */
const CP_AD_SLOT = '6faee067-68a2-40ef-aa20-2065bb306f4c';

export default function AdUnit() {
  return (
    <div style={{ margin: '10px 0' }}>
      <div data-cp-ad="" data-slot={CP_AD_SLOT} data-format="text_link" />
    </div>
  );
}
