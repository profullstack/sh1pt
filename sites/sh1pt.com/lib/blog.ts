import 'server-only';
import { getSupabaseServiceClient } from './supabase/service';

export type BlogPost = {
  id: string;
  source: string;
  source_id: string | null;
  slug: string;
  title: string;
  content_markdown: string | null;
  content_html: string | null;
  meta_description: string | null;
  image_url: string | null;
  tags: string[];
  source_created_at: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
};

export type BlogListItem = Pick<
  BlogPost,
  'id' | 'slug' | 'title' | 'meta_description' | 'image_url' | 'tags' | 'published_at'
>;

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://sh1pt.com';

function tryClient() {
  try {
    return getSupabaseServiceClient();
  } catch (err) {
    // Supabase env may be absent during build (Railway etc.). Empty
    // data lets prerender succeed; runtime requests will succeed once
    // env is loaded.
    console.warn('[blog] supabase unavailable:', (err as Error).message);
    return null;
  }
}

export async function listPosts(limit = 50): Promise<BlogListItem[]> {
  const supabase = tryClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, meta_description, image_url, tags, published_at')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[blog] list error:', error);
    return [];
  }
  return (data ?? []) as BlogListItem[];
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const supabase = tryClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error('[blog] get error:', error);
    return null;
  }
  return (data as BlogPost) ?? null;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
