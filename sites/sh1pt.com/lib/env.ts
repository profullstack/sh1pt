// Typed env helper. Anything pulled from process.env should pass through
// this so the call sites don't sprinkle `?? ''` checks. Keep the shape
// small — only add fields the app actually reads.

export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sh1pt.com',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',

  // sh1pt Actions Fleet GitHub App. Created once via the App Manifest
  // flow at /admin/github/setup (admin pastes the result into Railway).
  // Private key is stored as the raw PEM — Railway sometimes mangles
  // newlines, so call sites should normalize "\\n" → "\n".
  githubAppId: process.env.GITHUB_APP_ID ?? '',
  githubAppSlug: process.env.GITHUB_APP_SLUG ?? '',
  githubAppClientId: process.env.GITHUB_APP_CLIENT_ID ?? '',
  githubAppClientSecret: process.env.GITHUB_APP_CLIENT_SECRET ?? '',
  githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY ?? '',
  githubAppWebhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET ?? '',
};

export function isGithubAppConfigured(): boolean {
  return Boolean(env.githubAppId && env.githubAppPrivateKey);
}
