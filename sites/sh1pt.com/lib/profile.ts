import {
  COLUMNS,
  createProfileStore,
  validateProfile,
  type ProfileField,
  type ProfileFields,
  type ProfileStore,
} from '@profullstack/profile';
import { getSupabaseServiceClient } from './supabase/service';

// The shared @profullstack/profile fields live in public.user_profiles
// (keyed by auth.users.id). Server-only: RLS has no anon/authenticated
// policies, so this always runs on the service-role client.
let cached: ProfileStore | null = null;

export function profileStore(): ProfileStore {
  cached ??= createProfileStore(getSupabaseServiceClient(), { table: 'user_profiles', key: 'user_id' });
  return cached;
}

type Metadata = Record<string, unknown> | null | undefined;

// The waitlist is a magic-link signup: the auth.users row only exists once
// the link is clicked. The validated fields ride along as user metadata
// (signInWithOtp options.data, kept only when the address is new) and are
// stored here when the link is verified.
export function profileMetadata(profile: Partial<ProfileFields>): Partial<Record<ProfileField, string>> {
  const out: Partial<Record<ProfileField, string>> = {};
  for (const c of COLUMNS) {
    if (c !== 'email' && profile[c]) out[c] = profile[c] as string;
  }
  return out;
}

// Called after the session is established (/auth/callback, /auth/verify).
// Metadata outlives the first sign-in, so it is copied only while the person
// has no profile row yet: later edits through /api/v1/me/profile win.
// A failed save never blocks sign-in.
export async function saveProfileFromMetadata(
  user: { id: string; email?: string | null; user_metadata?: Metadata },
  store: Pick<ProfileStore, 'get' | 'save'> = profileStore(),
): Promise<boolean> {
  const meta = user.user_metadata ?? {};
  if (!meta.first_name && !meta.last_name) return false;
  const input = Object.fromEntries(COLUMNS.map((c) => [c, meta[c] ?? null]));
  input.email = user.email ?? null;
  const check = validateProfile(input);
  if (!check.ok) return false;
  try {
    if (await store.get(user.id)) return false;
    await store.save(user.id, check.profile);
    return true;
  } catch (e) {
    console.error('[profile] save from signup metadata failed', e);
    return false;
  }
}
