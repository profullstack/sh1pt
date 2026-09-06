/**
 * Browser recipes for the chores that have no API.
 *
 * Every provider surface sh1pt talks to is, in order of preference: an
 * official CLI, an official API, an unofficial API, an MCP server, and only
 * then a browser. This package is that last rung, and it exists because some
 * settings genuinely have no other door: Google's OAuth consent screen, Meta's
 * redirect URI list, App Store review answers.
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

export * as googleCloudOAuth from './recipes/google-cloud-oauth.js';

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
];
