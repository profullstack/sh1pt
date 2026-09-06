/**
 * addons.mozilla.org: appealing a reviewer decision.
 *
 * When Mozilla disables an add-on, *every* write to it 403s — not just the
 * disable flag. A `PATCH /addons/addon/<id>/` carrying nothing but listing copy
 * is refused too, so a privacy policy cannot be attached, a new version cannot
 * be uploaded, and the listing 404s publicly. Reads still work. There is no API
 * that lifts the block: the only route back is an appeal, decided by a human.
 *
 * That makes this recipe unusual for this package. It is not automating a
 * setting that merely lacks an endpoint; it is submitting a document to a
 * moderator. So it fills and submits the form, and reports what the page said
 * back, and does nothing else.
 *
 * ---
 *
 * Unlike the Chrome Web Store recipe, the selectors here are NOT guesses. They
 * are read off Mozilla's own source, which is open:
 *
 *   src/olympia/abuse/urls.py       `appeal/<str:decision_cinder_id>/`
 *   src/olympia/abuse/forms.py      AbuseAppealForm.reason (Textarea),
 *                                   AbuseAppealEmailForm.email
 *   templates/abuse/appeal.html     #appeal-submit, #appeal-thank-you
 *
 * Django's `as_div()` renders a field named `reason` with id `id_reason`, so
 * the ids below follow from the form definitions rather than from inspection.
 *
 * Two things in that source are worth knowing before running this:
 *
 *  1. The email form appears only in some flows (an appeal from someone who
 *     cannot log in). When it does, `clean_email` compares what you type
 *     against the address the decision was sent to and rejects anything else
 *     with "Invalid email provided." — so the address is not a free field.
 *  2. Appeals are throttled at **20 per day**, per IP and per user. Retrying a
 *     failed submit in a loop will burn that quota.
 */
import { type Session } from '../session.js';

const AMO = 'https://addons.mozilla.org';

/** The decision id from the reviewer email. Cinder ids are uuid-shaped. */
export const DECISION_ID_PATTERN = /^[0-9a-f-]{8,64}$/i;

export function assertDecisionId(id: string): string {
  if (!DECISION_ID_PATTERN.test(id)) {
    throw new Error(
      `"${id}" does not look like a decision id. It is in the reviewer email — the ` +
        'value after "ref:" in the subject, or the last path segment of the appeal link it contains.',
    );
  }
  return id;
}

/**
 * The author appeal URL.
 *
 * Mozilla routes two shapes: `appeal/<decision>/` for the add-on's author and
 * `appeal/<report>/<decision>/` for whoever reported it. A developer appealing
 * their own add-on always wants the first.
 */
export function appealUrl(decisionCinderId: string, locale = 'en-US'): string {
  return `${AMO}/${locale}/abuse/appeal/${assertDecisionId(decisionCinderId)}/`;
}

/* -------------------------------------------------------------------------- */
/* Status, over the public API — no browser and no credentials needed          */
/* -------------------------------------------------------------------------- */

export interface AddonState {
  disabledByMozilla: boolean;
  disabledByDeveloper: boolean;
  /** True when the add-on is readable and public. */
  listed: boolean;
  slug: string | null;
  status: string | null;
  /** What to do next, in one line. */
  verdict: string;
}

/**
 * Read an add-on's state out of an AMO API response.
 *
 * The useful quirk: for a Mozilla-disabled add-on the API answers **401** to an
 * unauthenticated caller, but the body still carries `is_disabled_by_mozilla`
 * and `is_disabled_by_developer`. So a 401 body is informative and must not be
 * discarded as an auth failure — it is how you learn the add-on is blocked
 * without holding any credentials at all.
 */
export function parseAddonState(body: Record<string, any>, httpStatus: number): AddonState {
  const disabledByMozilla = body.is_disabled_by_mozilla === true;
  const disabledByDeveloper = body.is_disabled_by_developer === true;
  const listed = httpStatus === 200 && !disabledByMozilla;

  let verdict: string;
  if (disabledByMozilla) {
    verdict =
      'Disabled by Mozilla. Every write 403s, including listing-only PATCHes. ' +
      'An appeal is the only route back, and a human decides it.';
  } else if (disabledByDeveloper) {
    verdict = 'Disabled by you. Re-enable it in the Developer Hub; no appeal needed.';
  } else if (listed) {
    verdict = 'Public. Nothing to appeal.';
  } else {
    verdict = `Not readable (HTTP ${httpStatus}) and not flagged as disabled. Check the id or slug.`;
  }

  return {
    disabledByMozilla,
    disabledByDeveloper,
    listed,
    slug: typeof body.slug === 'string' ? body.slug : null,
    status: typeof body.status === 'string' ? body.status : null,
    verdict,
  };
}

/** Fetch and interpret an add-on's state. Numeric id or slug both work. */
export async function readAddonState(addon: string | number): Promise<AddonState> {
  const response = await fetch(`${AMO}/api/v5/addons/addon/${encodeURIComponent(String(addon))}/`, {
    headers: { Accept: 'application/json', 'User-Agent': 'sh1pt-browser/amo-appeal' },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  return parseAddonState(body, response.status);
}

/* -------------------------------------------------------------------------- */
/* The appeal itself                                                          */
/* -------------------------------------------------------------------------- */

/**
 * True when the profile holds an AMO developer session.
 *
 * Tested positively against the Developer Hub, which redirects a signed-out
 * browser to a login page on a different path — the same trap documented in
 * google-cloud-oauth, where checking for the *absence* of a login URL reports a
 * signed-out browser as signed in.
 */
export async function isSignedIn(session: Session): Promise<boolean> {
  const { page } = session;
  await page.goto(`${AMO}/en-US/developers/addons`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return /\/developers\/addons/.test(page.url()) && !/\/login|accounts\.firefox\.com/.test(page.url());
}

export type AppealOutcome =
  | 'recorded'
  | 'already-decided'
  | 'not-appealable'
  | 'rejected-email'
  | 'unknown';

export interface AppealMarkers {
  thankYou: boolean;
  alreadyDecided: boolean;
  formPresent: boolean;
  invalidEmail: boolean;
}

/**
 * Turn what the page shows into one outcome.
 *
 * Order matters: the template renders the thank-you *instead of* the form, and
 * renders an "already reviewed a similar appeal" branch instead of both. An
 * invalid email re-renders the form with an error, so the form being present is
 * the weakest signal and is checked last.
 */
export function appealOutcome(markers: AppealMarkers): AppealOutcome {
  if (markers.thankYou) return 'recorded';
  if (markers.invalidEmail) return 'rejected-email';
  if (markers.alreadyDecided) return 'already-decided';
  if (!markers.formPresent) return 'not-appealable';
  return 'unknown';
}

export interface AppealInput {
  decisionCinderId: string;
  /** Why the decision was wrong. This is the substance of the appeal. */
  reason: string;
  /**
   * Only used when the page asks for it. Mozilla compares it against the
   * address the decision was sent to and rejects anything else.
   */
  email?: string;
  locale?: string;
}

/**
 * Submit an appeal and report what came back.
 *
 * Deliberately does not retry: appeals are throttled 20/day per IP and per
 * user, and a moderation queue is not a place to spray submissions.
 */
export async function submitAppeal(
  session: Session,
  input: AppealInput,
): Promise<{ outcome: AppealOutcome; url: string }> {
  const { page } = session;
  const url = appealUrl(input.decisionCinderId, input.locale);

  if (!input.reason.trim()) {
    throw new Error('An appeal needs a reason: explain why the decision was made in error.');
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const reason = page.locator('#id_reason, textarea[name="reason"]').first();
  const hasForm = await reason.isVisible().catch(() => false);

  if (hasForm) {
    await reason.fill(input.reason);

    // The email field is conditional. Fill it only if it rendered.
    const email = page.locator('#id_email, input[name="email"]').first();
    if (input.email && (await email.isVisible().catch(() => false))) {
      await email.fill(input.email);
    }

    await page.locator('#appeal-submit').click();
    await page.waitForLoadState('networkidle').catch(() => undefined);
  }

  const text = (await page.locator('body').innerText().catch(() => '')) as string;
  const outcome = appealOutcome({
    thankYou: await page.locator('#appeal-thank-you').isVisible().catch(() => false),
    alreadyDecided: /already reviewed a similar appeal/i.test(text),
    formPresent: await page
      .locator('#id_reason, textarea[name="reason"]')
      .isVisible()
      .catch(() => false),
    invalidEmail: /invalid email provided/i.test(text),
  });

  if (outcome === 'unknown') {
    await session.ask(
      'amo-appeal',
      `Submitted the appeal for decision ${input.decisionCinderId} but could not read the result. ` +
        `Open ${url} and check whether it was recorded, then reply with what it said.`,
    );
  }

  return { outcome, url };
}
