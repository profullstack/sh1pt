/**
 * Chrome Web Store: the publish conditions that the Publish API cannot set.
 *
 * The Web Store API (`chromewebstore/v1.1`) does exactly three things — create
 * an item, put a package on it, and publish it. Everything the store *checks*
 * before it will publish lives in the Developer Dashboard and has no endpoint
 * at all. A real refusal, taken verbatim from the API on 2026-09-06, reads:
 *
 *   Publish condition not met: To publish your item, you must provide mandatory
 *   privacy information ...; A justification for remote code use is required.;
 *   A justification for host permission use is required.; ... you must certify
 *   that your data usage complies with our Developer Program Policies.;
 *   Language is not selected.; Please select a Category for your item.; Icon
 *   image is missing.; At least one screenshot or video is required.; The
 *   detailed description is too short or is missing.; You have published the
 *   maximum allowed number of 3 extensions.
 *
 * Ten conditions, and `POST /items/{id}/publish` can satisfy none of them.
 *
 * Unpublishing is likewise dashboard-only, and this was established by trying
 * rather than by reading the docs. Against a real item:
 *
 *   POST /items/{id}/unpublish                        -> 404 (no such route)
 *   POST /items/{id}/publish?publishTarget=unpublished -> 400 Invalid Value
 *   POST /items/{id}/publish?deployPercentage=0        -> 400 ineligible for
 *                                                        partial rollouts
 *   DELETE /items/{id}                                 -> 404
 *
 * That matters because the publisher cap counts *published* items: with three
 * live, a fourth cannot ship until one is unpublished, and only a human or this
 * recipe can do it.
 *
 * ---
 *
 * WARNING, and it is the important part of this file: the selectors below are
 * written from the dashboard's documented structure, NOT from a live DOM — the
 * Google account this package signs in with has a stale password, so no run has
 * ever reached the console. Treat every locator as a first guess. The pure
 * functions (`prepareListing`, `unmetConditions`, `slotStatus`, the URL
 * builders) are exercised by the tests and are the parts to trust today.
 *
 * Every interaction is written to park through `session.ask` rather than throw,
 * so a wrong selector costs a prompt and a screenshot instead of a failed run.
 */
import { anyVisible, clickFirst, type Session } from '../session.js';

const CONSOLE = 'https://chrome.google.com/webstore/devconsole';

/** A Chrome extension id: 32 letters in a-p. */
export const ITEM_ID_PATTERN = /^[a-p]{32}$/;

export interface ItemTarget {
  itemId: string;
  /** Publisher/account id. The console tolerates its absence and redirects. */
  publisherId?: string;
}

export function assertItemId(itemId: string): string {
  if (!ITEM_ID_PATTERN.test(itemId)) {
    throw new Error(
      `"${itemId}" is not a Chrome extension id (expected 32 characters, each a-p). ` +
        'The id is in the store URL after /detail/<slug>/.',
    );
  }
  return itemId;
}

export function itemEditUrl({ itemId, publisherId }: ItemTarget): string {
  assertItemId(itemId);
  return publisherId
    ? `${CONSOLE}/${encodeURIComponent(publisherId)}/${itemId}/edit`
    : `${CONSOLE}/${itemId}/edit`;
}

export function itemPrivacyUrl(target: ItemTarget): string {
  return `${itemEditUrl(target)}/privacy`;
}

/**
 * The public listing URL. An unpublished item redirects to a path containing
 * `empty-title`, which is the cheapest published/not check there is and needs
 * no credentials at all.
 */
export function publicListingUrl(itemId: string): string {
  return `https://chromewebstore.google.com/detail/${assertItemId(itemId)}`;
}

export function looksUnpublished(finalUrl: string): boolean {
  return finalUrl.includes('/detail/empty-title/');
}

/* -------------------------------------------------------------------------- */
/* Listing copy                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The shape of a `store-listing.json` — the file a repo keeps so the copy that
 * has to be typed into the dashboard is reviewed like any other source.
 */
export interface StoreListingFile {
  name?: string;
  summary?: string;
  description?: string;
  homepageUrl?: string;
  supportUrl?: string;
  privacyPolicyUrl?: string;
  chrome?: {
    category?: string;
    language?: string;
    singlePurpose?: string;
    remoteCode?: string;
    permissionJustifications?: Record<string, string>;
    dataUse?: { collected?: string[]; notes?: string };
  };
}

export interface PreparedListing {
  name: string;
  summary: string;
  description: string;
  category: string;
  language: string;
  homepageUrl?: string;
  supportUrl?: string;
  privacyPolicyUrl?: string;
  singlePurpose: string;
  remoteCode: string;
  permissionJustifications: Record<string, string>;
  dataUse: { collected: string[]; notes: string };
}

/** Google's own limits, which the dashboard enforces silently by truncation. */
export const SUMMARY_MAX = 132;
export const DESCRIPTION_MIN = 25;

/**
 * Validate a listing file and flatten it into the fields the dashboard asks
 * for. Fails loudly and all at once: a run that discovers a missing category
 * after twenty minutes of form-filling has wasted the trip.
 */
export function prepareListing(file: StoreListingFile): PreparedListing {
  const chrome = file.chrome ?? {};
  const problems: string[] = [];

  const require = (value: string | undefined, what: string): string => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) problems.push(`missing ${what}`);
    return trimmed;
  };

  const name = require(file.name, 'name');
  const summary = require(file.summary, 'summary');
  const description = require(file.description, 'description');
  const category = require(chrome.category, 'chrome.category');
  const language = require(chrome.language, 'chrome.language');
  const singlePurpose = require(chrome.singlePurpose, 'chrome.singlePurpose');
  const remoteCode = require(chrome.remoteCode, 'chrome.remoteCode');

  if (summary.length > SUMMARY_MAX) {
    problems.push(`summary is ${summary.length} characters, over the ${SUMMARY_MAX} limit`);
  }
  if (description && description.length < DESCRIPTION_MIN) {
    problems.push(`description is ${description.length} characters, under the ${DESCRIPTION_MIN} minimum`);
  }

  const justifications = chrome.permissionJustifications ?? {};
  if (Object.keys(justifications).length === 0) {
    problems.push('missing chrome.permissionJustifications (host permissions need one each)');
  }
  for (const [permission, text] of Object.entries(justifications)) {
    if (!text.trim()) problems.push(`empty justification for "${permission}"`);
  }

  if (problems.length) {
    throw new Error(`store-listing is not publishable:\n  - ${problems.join('\n  - ')}`);
  }

  return {
    name,
    summary,
    description,
    category,
    language,
    homepageUrl: file.homepageUrl?.trim() || undefined,
    supportUrl: file.supportUrl?.trim() || undefined,
    privacyPolicyUrl: file.privacyPolicyUrl?.trim() || undefined,
    singlePurpose,
    remoteCode,
    permissionJustifications: justifications,
    dataUse: {
      collected: chrome.dataUse?.collected ?? [],
      notes: chrome.dataUse?.notes ?? '',
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Reading the API's refusal                                                  */
/* -------------------------------------------------------------------------- */

export interface PublishRefusal {
  conditions: string[];
  /** True when "You have published the maximum allowed number of N" appears. */
  slotCapReached: boolean;
  slotCap: number | null;
}

/**
 * Split a `Publish condition not met: ...` message into its parts.
 *
 * Google returns every unmet condition in one semicolon-joined string, so the
 * caller can act on the list — in particular, tell "the listing is empty" apart
 * from "the listing is fine but there is no free publisher slot", which are
 * very different chores.
 */
export function unmetConditions(message: string): PublishRefusal {
  const body = message.replace(/^.*?Publish condition not met:\s*/s, '');
  const conditions = body
    .split(';')
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const cap = conditions.find((c) => /maximum allowed number of \d+/i.test(c));
  const capMatch = cap?.match(/maximum allowed number of (\d+)/i);

  return {
    conditions,
    slotCapReached: Boolean(cap),
    slotCap: capMatch ? Number(capMatch[1]) : null,
  };
}

export interface SlotStatus {
  published: number;
  cap: number;
  free: number;
  /** Items that could be unpublished, cheapest first. */
  candidates: Array<{ itemId: string; name: string; users: number }>;
}

/**
 * Decide which item is cheapest to unpublish.
 *
 * Sorted by user count ascending, so the least-used listing is offered first.
 * An item with no reported count sorts as zero: the Web Store hides the number
 * entirely below a small threshold, so "not shown" means "very few", not
 * "unknown and possibly many".
 */
export function slotStatus(
  items: Array<{ itemId: string; name: string; users?: number | null; published: boolean }>,
  cap = 3,
): SlotStatus {
  const published = items.filter((item) => item.published);
  return {
    published: published.length,
    cap,
    free: Math.max(0, cap - published.length),
    candidates: published
      .map((item) => ({ itemId: item.itemId, name: item.name, users: item.users ?? 0 }))
      .sort((a, b) => a.users - b.users || a.name.localeCompare(b.name)),
  };
}

/* -------------------------------------------------------------------------- */
/* Browser actions                                                            */
/* -------------------------------------------------------------------------- */

/**
 * True when the profile already holds a Web Store developer session.
 *
 * Tests positively for the console URL, for the reason spelled out in
 * google-cloud-oauth: a signed-out Google browser is bounced somewhere that
 * does not look like a login page, so "not on accounts.google.com" reports a
 * signed-out browser as signed in.
 */
export async function isSignedIn(session: Session): Promise<boolean> {
  const { page } = session;
  await page.goto(CONSOLE, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return /^https:\/\/chrome\.google\.com\/webstore\/devconsole/.test(page.url());
}

/**
 * Unpublish an item, freeing a publisher slot.
 *
 * The confirm dialog is the dangerous half: it is the only irreversible step,
 * and a mis-aimed click could unpublish something else. So the item's own edit
 * page is loaded first and the name on screen is handed back to the caller,
 * which lets `sh1pt browser` show what it is about to take down.
 */
export async function unpublish(session: Session, target: ItemTarget): Promise<{ unpublished: boolean; name: string }> {
  const { page } = session;
  await page.goto(itemEditUrl(target), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const name = (await page.locator('h1, [role="heading"]').first().textContent().catch(() => null))?.trim() ?? '';

  const alreadyDown = await anyVisible(page, [
    'text=/unpublished/i',
    'text=/not published/i',
  ]);
  if (alreadyDown) return { unpublished: false, name };

  try {
    await clickFirst(page, [
      'button:has-text("Unpublish")',
      '[aria-label="Unpublish"]',
      'text=/^Unpublish$/',
    ]);
  } catch {
    await session.ask(
      'chrome-web-store-unpublish',
      `Could not find the Unpublish control for ${target.itemId}. Unpublish it in the dashboard, ` +
        'then reply "done". (The selectors in this recipe have never been run against the live DOM.)',
    );
    return { unpublished: true, name };
  }

  // The confirmation is a second, separate click. Missing it leaves the item up
  // while the recipe reports success, which is the worst possible outcome here.
  try {
    await clickFirst(page, [
      'button:has-text("Unpublish")',
      'button:has-text("Confirm")',
      'button:has-text("OK")',
    ], { timeoutMs: 15_000 });
  } catch {
    await session.ask(
      'chrome-web-store-unpublish-confirm',
      `Clicked Unpublish for ${target.itemId} but found no confirmation dialog. ` +
        'Confirm it in the dashboard if it is still open, then reply "done".',
    );
  }

  await page.waitForLoadState('networkidle').catch(() => undefined);
  return { unpublished: true, name };
}

/**
 * Fill the listing and privacy-practices fields from a prepared listing.
 *
 * Returns the fields it believes it set. It does NOT submit or publish: the
 * publish itself is an API call the caller already has, and separating them
 * means a half-filled form can be inspected rather than shipped.
 */
export async function fillListing(
  session: Session,
  target: ItemTarget,
  listing: PreparedListing,
): Promise<{ filled: string[]; skipped: string[] }> {
  const { page } = session;
  const filled: string[] = [];
  const skipped: string[] = [];

  const setField = async (label: string, candidates: string[], value: string): Promise<void> => {
    if (!value) return;
    const field = page.locator(candidates.join(', ')).first();
    try {
      await field.waitFor({ state: 'visible', timeout: 10_000 });
      await field.fill(value);
      filled.push(label);
    } catch {
      skipped.push(label);
    }
  };

  await page.goto(itemEditUrl(target), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  await setField('summary', ['textarea[aria-label*="summary" i]', 'input[aria-label*="summary" i]'], listing.summary);
  await setField(
    'description',
    ['textarea[aria-label*="description" i]', 'textarea[name*="description" i]'],
    listing.description,
  );
  await setField('homepageUrl', ['input[aria-label*="website" i]', 'input[aria-label*="homepage" i]'], listing.homepageUrl ?? '');
  await setField('supportUrl', ['input[aria-label*="support" i]'], listing.supportUrl ?? '');

  await page.goto(itemPrivacyUrl(target), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  await setField(
    'singlePurpose',
    ['textarea[aria-label*="single purpose" i]', 'textarea[aria-label*="purpose" i]'],
    listing.singlePurpose,
  );
  await setField(
    'remoteCode',
    ['textarea[aria-label*="remote code" i]'],
    listing.remoteCode,
  );

  for (const [permission, text] of Object.entries(listing.permissionJustifications)) {
    await setField(
      `justification:${permission}`,
      [
        `textarea[aria-label*="${permission}" i]`,
        `textarea[data-permission="${permission}"]`,
      ],
      text,
    );
  }

  // Category, language, the data-use checkboxes and the policy certification
  // are selects and tick-boxes whose markup is not documented anywhere this
  // recipe could read. Rather than click blindly on a compliance attestation,
  // hand them over.
  const manual = ['category', 'language', 'dataUse', 'policyCertification'];
  skipped.push(...manual);
  await session.ask(
    'chrome-web-store-listing',
    [
      `Set these by hand for ${target.itemId}, then reply "done":`,
      `  Category: ${listing.category}`,
      `  Language: ${listing.language}`,
      `  Data collected: ${listing.dataUse.collected.join(', ') || '(none)'}`,
      `  Data use notes: ${listing.dataUse.notes}`,
      '  Tick the Developer Program Policies certification.',
      '',
      'These are a dropdown, a dropdown, a checkbox group and a compliance',
      'attestation. Clicking an attestation from a guessed selector is not',
      'something this recipe will do on your behalf.',
    ].join('\n'),
  );

  return { filled, skipped };
}
