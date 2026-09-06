/**
 * Browser recipes for the chores that have no API.
 *
 * Every provider surface sh1pt talks to is, in order of preference: an
 * official CLI, an official API, an unofficial API, an MCP server, and only
 * then a browser. This package is that last rung, and it exists because some
 * settings genuinely have no other door: Google's OAuth consent screen, Meta's
 * redirect URI list, App Store review answers, and the trusted publishers that
 * let a CI workflow publish a package without a long-lived token.
 *
 * A recipe is a plain function over a `Session`, so it composes and tests like
 * any other code. The registry below is what `sh1pt browser` lists.
 */
export {
  openSession,
  clickFirst,
  anyVisible,
  DEFAULT_ROOT,
  type Session,
  type SessionOptions,
} from './session.js';

export { base32Decode, secondsRemaining, totp, twoFactorCode, type TotpOptions } from './totp.js';

export * as googleCloudOAuth from './recipes/google-cloud-oauth.js';
export * as metaApp from './recipes/meta-app.js';
export * as pypiTrustedPublisher from './recipes/pypi-trusted-publisher.js';
export * as rubygemsTrustedPublisher from './recipes/rubygems-trusted-publisher.js';

export interface RecipeInfo {
  id: string;
  label: string;
  /** Why a browser and not an API. */
  because: string;
  profile: string;
  actions: string[];
}

/** What `sh1pt browser list` prints. Keep it in step with the exports above. */
export const RECIPES: RecipeInfo[] = [
  {
    id: 'google-cloud-oauth',
    label: 'Google Cloud — OAuth consent screen',
    because: 'gcloud covers the rest of Google Cloud; test users, publishing status and client redirect URIs are console-only.',
    profile: 'google',
    actions: ['status', 'add-test-users', 'publish', 'add-redirect-uri'],
  },
  {
    id: 'pypi-trusted-publisher',
    label: 'PyPI — trusted publishers',
    because:
      'the upload API publishes packages, not account settings, and a pending publisher is the only way to ship a brand-new project with no token.',
    profile: 'pypi',
    actions: ['list', 'add-pending'],
  },
  {
    id: 'rubygems-trusted-publisher',
    label: 'RubyGems — trusted publishers',
    because:
      'trusted publishers live under the profile, with no API and no `gem` command; a pending one publishes a new gem with no key at all.',
    profile: 'rubygems',
    actions: ['list', 'add-pending'],
  },
  {
    id: 'meta-app',
    label: 'Meta — app settings',
    because:
      "Meta's app-settings API refuses with (#10) until 'Allow API Access to App Settings' is ticked, and that tick is console-only.",
    profile: 'facebook',
    actions: ['status', 'add-redirect-uri'],
  },
];
