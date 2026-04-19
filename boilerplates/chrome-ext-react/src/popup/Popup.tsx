import { useEffect, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { storage: chrome.storage.local as unknown as Storage } },
);

export function Popup() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  return (
    <div style={{ width: 280, padding: 16, fontFamily: 'system-ui' }}>
      <h2>sh1pt ext</h2>
      <p>{user ? `Hi ${user.email}` : 'Not signed in.'}</p>
    </div>
  );
}
