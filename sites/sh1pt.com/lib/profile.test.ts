import { describe, expect, it, vi } from 'vitest';
import { validateProfile } from '@profullstack/profile';
import { profileMetadata, saveProfileFromMetadata } from './profile';

// The waitlist form posts these; joinWaitlist validates them and sends them
// as signInWithOtp metadata; the verified link stores them.
function waitlistForm(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function fakeStore(existing: unknown = null) {
  return { get: vi.fn(async () => existing), save: vi.fn(async (_id: string, p: unknown) => p) };
}

describe('waitlist signup profile', () => {
  it('stores the six fields after the magic link is verified', async () => {
    const check = validateProfile(
      waitlistForm({
        email: 'Ada@Acme.com',
        first_name: 'Ada',
        last_name: 'Lovelace',
        company_domain: 'https://www.acme.com/about',
        job_title: ' VP Engineering ',
        linkedin_url: 'in/ada-lovelace',
      }),
    );
    expect(check.ok).toBe(true);
    const user_metadata = { handle: '@ada', ...profileMetadata(check.profile) };

    const store = fakeStore();
    const saved = await saveProfileFromMetadata({ id: 'u1', email: 'ada@acme.com', user_metadata }, store as never);

    expect(saved).toBe(true);
    expect(store.save).toHaveBeenCalledWith('u1', {
      email: 'ada@acme.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
      company_domain: 'acme.com',
      job_title: 'VP Engineering',
      linkedin_url: 'https://www.linkedin.com/in/ada-lovelace',
    });
  });

  it('refuses a signup without first and last name', () => {
    const check = validateProfile(waitlistForm({ email: 'ada@acme.com' }));
    expect(check.ok).toBe(false);
    expect(Object.keys(check.errors)).toEqual(expect.arrayContaining(['first_name', 'last_name']));
  });

  it('does nothing for plain sign-ins or once a profile exists', async () => {
    const store = fakeStore();
    expect(await saveProfileFromMetadata({ id: 'u1', email: 'a@b.co', user_metadata: {} }, store as never)).toBe(false);
    const existing = fakeStore({ user_id: 'u1' });
    const meta = { first_name: 'Ada', last_name: 'Lovelace' };
    expect(await saveProfileFromMetadata({ id: 'u1', email: 'a@b.co', user_metadata: meta }, existing as never)).toBe(false);
    expect(store.save).not.toHaveBeenCalled();
    expect(existing.save).not.toHaveBeenCalled();
  });
});
