import { getSupabaseServerClient } from '@/lib/supabase/server';

interface Plugin {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  price_cents: number | null;  // null = free
  publisher_handle: string;
  downloads: number;
}

export default async function Browse() {
  const supabase = await getSupabaseServerClient();
  const { data: plugins } = await supabase
    .from('plugins')
    .select('id, slug, name, tagline, price_cents, publisher_handle, downloads')
    .eq('status', 'approved')
    .order('downloads', { ascending: false })
    .limit(48);

  return (
    <main style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h1>sh1pt · plugin marketplace</h1>
      <p>Discover and install plugins. Publish your own at <code>/publisher</code>.</p>
      <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, listStyle: 'none', padding: 0 }}>
        {(plugins ?? []).map((p: Plugin) => (
          <li key={p.id} style={{ border: '1px solid #eee', padding: 16, borderRadius: 8 }}>
            <a href={`/p/${p.slug}`}><strong>{p.name}</strong></a>
            <div style={{ opacity: 0.7 }}>{p.tagline}</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              by @{p.publisher_handle} · {p.downloads} installs · {p.price_cents == null ? 'Free' : `$${(p.price_cents / 100).toFixed(2)}`}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
