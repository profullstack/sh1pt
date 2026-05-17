-- Network gate config for the autoblog receiver.
--
-- Each blog_integrations row (kind='crawlproof') can declare a niche
-- allowlist and quality thresholds. /api/webhooks/crawlproof runs
-- @profullstack/autoblog's gatePost() between verifyAndParse and the
-- blog_posts upsert, rejecting off-niche or low-quality posts before
-- they touch the public blog.
--
-- Defaults err generous:
--   - allowed_niches: empty array = accept any niche
--   - min_word_count: 500
--   - max_link_density: 1.0%
--   - banned_terms: empty
--   - min_quality_score: NULL = skip the LLM gate

alter table public.blog_integrations
  add column if not exists allowed_niches    text[]   not null default '{}',
  add column if not exists min_word_count    integer           default 500,
  add column if not exists max_link_density  numeric(5,2)      default 1.0,
  add column if not exists banned_terms      text[]   not null default '{}',
  add column if not exists min_quality_score smallint;
