'use client';

import { ProfileFields } from '@profullstack/profile/react';
import type { ProfileField } from '@profullstack/profile';

// The shared @profullstack/profile signup fields. Email has its own input on
// the waitlist form, so the package renders the other five.
const FIELDS: ProfileField[] = ['first_name', 'last_name', 'company_domain', 'job_title', 'linkedin_url'];

export function SignupProfileFields({ errors }: { errors?: Partial<Record<ProfileField, string>> }) {
  return <ProfileFields fields={FIELDS} idPrefix="waitlist-" errors={errors} />;
}
