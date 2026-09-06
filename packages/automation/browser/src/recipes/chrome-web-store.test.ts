import { describe, expect, it } from 'vitest';
import * as cws from './chrome-web-store.js';
import { RECIPES } from '../index.js';
import { parse, profileFor } from '../run.js';

const ITEM = 'pmckmdnikecngblpjdlhgnimickinfkp';

/** A minimally valid listing, mirroring coinpayportal's store-listing.json. */
const listing: cws.StoreListingFile = {
  name: 'CoinPay Portal Wallet',
  summary: 'Non-custodial multi-chain wallet with one-click x402 payments and bulk payouts.',
  description: 'CoinPay Portal Wallet is the browser wallet for coinpayportal.com, operated by Profullstack, Inc.',
  homepageUrl: 'https://coinpayportal.com',
  privacyPolicyUrl: 'https://coinpayportal.com/privacy',
  chrome: {
    category: 'Productivity',
    language: 'en',
    singlePurpose: 'A non-custodial cryptocurrency wallet.',
    remoteCode: 'No. The build ships every script it executes.',
    permissionJustifications: { storage: 'Stores the encrypted seed vault.' },
    dataUse: { collected: ['financialAndPaymentInfo'], notes: 'Addresses and signed transactions only.' },
  },
};

describe('assertItemId', () => {
  it('accepts a real 32-character a-p id', () => {
    expect(cws.assertItemId(ITEM)).toBe(ITEM);
  });

  it('rejects ids that are the wrong length or use letters past p', () => {
    expect(() => cws.assertItemId('tooshort')).toThrow(/not a Chrome extension id/);
    expect(() => cws.assertItemId('z'.repeat(32))).toThrow(/not a Chrome extension id/);
    expect(() => cws.assertItemId(`${ITEM}a`)).toThrow(/not a Chrome extension id/);
  });
});

describe('url builders', () => {
  it('includes the publisher id when one is known, and omits it otherwise', () => {
    expect(cws.itemEditUrl({ itemId: ITEM })).toBe(
      `https://chrome.google.com/webstore/devconsole/${ITEM}/edit`,
    );
    expect(cws.itemEditUrl({ itemId: ITEM, publisherId: '12345' })).toBe(
      `https://chrome.google.com/webstore/devconsole/12345/${ITEM}/edit`,
    );
  });

  it('derives the privacy tab from the edit page', () => {
    expect(cws.itemPrivacyUrl({ itemId: ITEM })).toBe(`${cws.itemEditUrl({ itemId: ITEM })}/privacy`);
  });

  it('recognises the empty-title redirect as unpublished', () => {
    expect(cws.looksUnpublished(`https://chromewebstore.google.com/detail/empty-title/${ITEM}`)).toBe(true);
    expect(cws.looksUnpublished(`https://chromewebstore.google.com/detail/marksyncr/${ITEM}`)).toBe(false);
  });
});

describe('prepareListing', () => {
  it('flattens a complete listing', () => {
    const prepared = cws.prepareListing(listing);
    expect(prepared.category).toBe('Productivity');
    expect(prepared.language).toBe('en');
    expect(prepared.permissionJustifications.storage).toMatch(/encrypted seed/);
    expect(prepared.dataUse.collected).toEqual(['financialAndPaymentInfo']);
  });

  it('reports every missing field at once rather than the first', () => {
    let message = '';
    try {
      cws.prepareListing({ name: 'x', chrome: { permissionJustifications: { storage: 'ok' } } });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/missing summary/);
    expect(message).toMatch(/missing description/);
    expect(message).toMatch(/missing chrome.category/);
    expect(message).toMatch(/missing chrome.language/);
  });

  it('rejects a summary over Google’s 132-character limit', () => {
    expect(() => cws.prepareListing({ ...listing, summary: 'a'.repeat(133) })).toThrow(/over the 132 limit/);
  });

  it('rejects a description under the 25-character minimum', () => {
    expect(() => cws.prepareListing({ ...listing, description: 'too short' })).toThrow(/under the 25 minimum/);
  });

  it('rejects a listing with no permission justifications', () => {
    const bare = { ...listing, chrome: { ...listing.chrome, permissionJustifications: {} } };
    expect(() => cws.prepareListing(bare)).toThrow(/permissionJustifications/);
  });

  it('rejects an empty justification for a named permission', () => {
    const blank = { ...listing, chrome: { ...listing.chrome, permissionJustifications: { storage: '   ' } } };
    expect(() => cws.prepareListing(blank)).toThrow(/empty justification for "storage"/);
  });
});

describe('unmetConditions', () => {
  // Verbatim from the Chrome Web Store API on 2026-09-06.
  const real =
    'Publish condition not met: To publish your item, you must provide mandatory privacy information in the ' +
    'new Developer Dashboard: https://chrome.google.com/webstore/devconsole. Click on your item from the home ' +
    'page and enter this information on the Privacy practices tab.; A justification for remote code use is ' +
    'required. This can be entered on the Privacy practices tab.; A justification for host permission use is ' +
    'required. This can be entered on the Privacy practices tab.; To publish your item, you must certify that ' +
    'your data usage complies with our Developer Program Policies. You can certify this on the Privacy ' +
    'practices tab of the item edit page.; Language is not selected.; Please select a Category for your item.; ' +
    'Icon image is missing.; At least one screenshot or video is required.; The detailed description is too ' +
    'short or is missing. Minimal length is 25 characters.; You have published the maximum allowed number of ' +
    '3 extensions. To publish this one, request a limit increase or unpublish another extension.';

  it('splits the real refusal into its ten conditions', () => {
    const refusal = cws.unmetConditions(real);
    expect(refusal.conditions).toHaveLength(10);
    expect(refusal.conditions.some((c) => c.startsWith('Language is not selected'))).toBe(true);
    expect(refusal.conditions.some((c) => c.startsWith('Icon image is missing'))).toBe(true);
  });

  it('detects the publisher slot cap and its number', () => {
    const refusal = cws.unmetConditions(real);
    expect(refusal.slotCapReached).toBe(true);
    expect(refusal.slotCap).toBe(3);
  });

  it('reports no cap when the listing is the only problem', () => {
    const refusal = cws.unmetConditions('Publish condition not met: Icon image is missing.');
    expect(refusal.conditions).toEqual(['Icon image is missing.']);
    expect(refusal.slotCapReached).toBe(false);
    expect(refusal.slotCap).toBeNull();
  });
});

describe('slotStatus', () => {
  // The three items actually published on the shared Profullstack account,
  // with the user counts read off the public listings on 2026-09-06.
  const items = [
    { itemId: 'hjcjjcpialiakkalcgadnfnoomdaegjg', name: 'MarkSyncr', users: 33, published: true },
    { itemId: 'efdlekcpbjccbilfonhbdicfoaklanap', name: 'DefPromo', users: 6, published: true },
    { itemId: 'aodamcbjoakjlpalnabjklmdmdnjmape', name: 'Grazily Applier', users: null, published: true },
    { itemId: ITEM, name: 'CoinPay Portal Wallet', users: null, published: false },
  ];

  it('counts published items against the cap', () => {
    const status = cws.slotStatus(items);
    expect(status.published).toBe(3);
    expect(status.cap).toBe(3);
    expect(status.free).toBe(0);
  });

  it('offers the least-used published item first, treating a hidden count as zero', () => {
    expect(cws.slotStatus(items).candidates.map((c) => c.name)).toEqual([
      'Grazily Applier',
      'DefPromo',
      'MarkSyncr',
    ]);
  });

  it('never offers an unpublished item as a candidate', () => {
    expect(cws.slotStatus(items).candidates.some((c) => c.itemId === ITEM)).toBe(false);
  });
});

describe('registration', () => {
  it('is listed by `sh1pt browser list`', () => {
    const entry = RECIPES.find((r) => r.id === 'chrome-web-store');
    expect(entry).toBeDefined();
    expect(entry!.actions).toEqual(['status', 'unpublish', 'fill-listing']);
  });

  it('shares the google profile, because the console is a Google property', () => {
    expect(profileFor('chrome-web-store')).toBe('google');
  });

  it('parses the flags the recipe needs', () => {
    const { recipe, action, options } = parse([
      'chrome-web-store', 'unpublish', '--item', ITEM, '--listing', './store-listing.json', '--publisher', '99',
    ]);
    expect(recipe).toBe('chrome-web-store');
    expect(action).toBe('unpublish');
    expect(options.item).toBe(ITEM);
    expect(options.listing).toBe('./store-listing.json');
    expect(options.publisher).toBe('99');
  });
});
