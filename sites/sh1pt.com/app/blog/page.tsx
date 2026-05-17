import type { Metadata } from 'next';
import { listPosts, formatDate, SITE_URL } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'Blog — sh1pt',
  description: 'Ship-it stories, platform deep-dives, and product updates.',
  alternates: { canonical: `${SITE_URL}/blog` },
};

export const dynamic = 'force-dynamic';

export default async function BlogIndexPage() {
  const posts = await listPosts(100);

  return (
    <main className="container" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: 0 }}>Blog</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Ship-it stories, platform deep-dives, and product updates.
        </p>
        <p style={{ marginTop: 8, fontSize: '0.85rem' }}>
          <a href="/blog/rss.xml" className="muted">RSS feed →</a>
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="muted">No posts yet. Check back soon.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16 }}>
          {posts.map((post) => (
            <li
              key={post.id}
              style={{
                border: '1px solid var(--border, rgba(255,255,255,0.1))',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <a href={`/blog/${post.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{post.title}</h2>
                {post.meta_description && (
                  <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                    {post.meta_description}
                  </p>
                )}
                <p
                  className="muted"
                  style={{ marginTop: 12, marginBottom: 0, fontSize: '0.85rem' }}
                >
                  {formatDate(post.published_at)}
                  {post.tags.length > 0 && ` · ${post.tags.join(', ')}`}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
