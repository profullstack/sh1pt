import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPostBySlug, formatDate, SITE_URL } from '@/lib/blog';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) {
    return { title: 'Not found — sh1pt' };
  }
  const canonical = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: `${post.title} — sh1pt`,
    description: post.meta_description ?? undefined,
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description: post.meta_description ?? undefined,
      url: canonical,
      type: 'article',
      images: post.image_url ? [post.image_url] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  return (
    <main className="container" style={{ paddingTop: 80, paddingBottom: 80, maxWidth: 760 }}>
      <p style={{ marginBottom: 24, fontSize: '0.85rem' }}>
        <a href="/blog" className="muted" style={{ textDecoration: 'none' }}>
          ← Blog
        </a>
      </p>

      <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: 0 }}>{post.title}</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: '0.9rem' }}>
        {formatDate(post.published_at)}
        {post.tags.length > 0 && ` · ${post.tags.join(', ')}`}
      </p>

      {post.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.image_url}
          alt={post.title}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 24,
            borderRadius: 12,
          }}
        />
      )}

      {post.content_html ? (
        <article
          style={{ marginTop: 32, lineHeight: 1.7 }}
          // content_html is rendered by the Crawlproof pipeline from
          // sanitized markdown; we trust it because only service-role
          // writes blog_posts and the source is authenticated by bearer.
          dangerouslySetInnerHTML={{ __html: post.content_html }}
        />
      ) : (
        <pre style={{ marginTop: 32, whiteSpace: 'pre-wrap' }}>
          {post.content_markdown ?? ''}
        </pre>
      )}
    </main>
  );
}
