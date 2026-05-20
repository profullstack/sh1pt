import { tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  mode?: 'api' | 'browser';
  apiToken?: string;
  baseUrl?: string;
  productSlug?: string;
  url?: string;
  topic?: string;
  featured?: boolean;
  first?: number;
  after?: string;
  postedAfter?: string;
  postedBefore?: string;
  order?: string;
  tagline?: string;
  galleryImages?: string[];
  topics?: string[];
  makers?: string[];
  firstComment?: string;
  scheduleFor?: Date;
  captchaSolver?: 'captcha-2captcha' | 'captcha-solver';
}

interface ProductHuntContext {
  secret?: (key: string) => string | undefined;
  log(message: string): void;
  dryRun?: boolean;
}

interface ProductHuntGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface ProductHuntPostNode {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description?: string | null;
  url: string;
  website?: string | null;
  votesCount: number;
  commentsCount: number;
  reviewsCount?: number;
  reviewsRating?: number;
  dailyRank?: number | null;
  featuredAt?: string | null;
  createdAt: string;
  scheduledAt?: string | null;
  thumbnail?: { url?: string | null } | null;
  topics?: {
    nodes?: Array<{
      name: string;
      slug: string;
    }>;
  };
  makers?: Array<{
    username?: string | null;
    name?: string | null;
  }>;
}

interface ProductHuntPost {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description?: string;
  url: string;
  website?: string;
  votesCount: number;
  commentsCount: number;
  reviewsCount?: number;
  reviewsRating?: number;
  dailyRank?: number;
  featuredAt?: string;
  createdAt: string;
  scheduledAt?: string;
  thumbnailUrl?: string;
  topics: Array<{ name: string; slug: string }>;
  makers: Array<{ username?: string; name?: string }>;
}

interface PostsData {
  posts: {
    totalCount: number;
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
    nodes?: ProductHuntPostNode[];
    edges?: Array<{ node?: ProductHuntPostNode }>;
  };
}

interface PostData {
  post?: ProductHuntPostNode | null;
}

const API_URL = 'https://api.producthunt.com/v2/api/graphql';
const TOKEN_SECRET = 'PRODUCTHUNT_API_TOKEN';

export default {
  id: 'outreach-producthunt',
  label: 'Product Hunt',

  async connect(ctx: ProductHuntContext, config: Config = {}) {
    if (!apiToken(ctx, config)) {
      throw new Error(`${TOKEN_SECRET} not in vault; create a Product Hunt developer token`);
    }
    ctx.log('producthunt api connected');
    return { accountId: 'producthunt' };
  },

  async search(ctx: ProductHuntContext, config: Config = {}) {
    const first = boundedFirst(config.first ?? 10);
    ctx.log(`producthunt posts · first=${first} · topic=${config.topic ?? 'any'}`);
    if (ctx.dryRun) return { posts: [], totalCount: 0, dryRun: true };

    const data = await productHuntGraphQL<PostsData>(ctx, config, POSTS_QUERY, {
      first,
      after: config.after,
      topic: config.topic,
      url: config.url,
      featured: config.featured,
      postedAfter: config.postedAfter,
      postedBefore: config.postedBefore,
      order: config.order,
    });

    const posts = (data.posts.nodes ?? data.posts.edges?.flatMap((edge) => edge.node ? [edge.node] : []) ?? [])
      .map(normalizePost);
    return {
      posts,
      totalCount: data.posts.totalCount,
      pageInfo: data.posts.pageInfo,
    };
  },

  async lookup(ctx: ProductHuntContext, config: Config) {
    if (!config.productSlug) throw new Error('outreach-producthunt lookup requires config.productSlug');
    ctx.log(`producthunt post · slug=${config.productSlug}`);
    if (ctx.dryRun) {
      return { post: undefined, slug: config.productSlug, dryRun: true };
    }

    const data = await productHuntGraphQL<PostData>(ctx, config, POST_QUERY, {
      slug: config.productSlug,
    });
    return { post: data.post ? normalizePost(data.post) : undefined };
  },

  async launch(ctx: ProductHuntContext, config: Config) {
    ctx.log(`producthunt launch · ${config.productSlug ?? '(new)'} · scheduled=${config.scheduleFor?.toISOString() ?? 'now'}`);
    if (ctx.dryRun) {
      return {
        id: 'dry-run',
        url: config.productSlug
          ? `https://www.producthunt.com/posts/${config.productSlug}`
          : 'https://www.producthunt.com/',
        checklist: launchChecklist(config),
      };
    }
    throw new Error('Product Hunt launch submissions require Product Hunt browser review; the public GraphQL API is read-only for posts');
  },

  setup: tokenSetup({
    secretKey: TOKEN_SECRET,
    label: 'Product Hunt',
    vendorDocUrl: 'https://www.producthunt.com/v2/docs',
    steps: [
      'Open api.producthunt.com/v2/oauth/applications and add an application',
      'Mint a developer token with public scope for GraphQL discovery',
      'Launch submissions still require Product Hunt browser review',
      'Never solicit upvotes in private channels',
    ],
  }),
};

const POST_FIELDS = `
  id
  name
  slug
  tagline
  description
  url
  website
  votesCount
  commentsCount
  reviewsCount
  reviewsRating
  dailyRank
  featuredAt
  createdAt
  scheduledAt
  thumbnail { url }
  topics { nodes { name slug } }
  makers { username name }
`;

const POSTS_QUERY = `
  query ProductHuntPosts(
    $first: Int!,
    $after: String,
    $topic: String,
    $url: String,
    $featured: Boolean,
    $postedAfter: DateTime,
    $postedBefore: DateTime,
    $order: PostsOrder
  ) {
    posts(
      first: $first,
      after: $after,
      topic: $topic,
      url: $url,
      featured: $featured,
      postedAfter: $postedAfter,
      postedBefore: $postedBefore,
      order: $order
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { ${POST_FIELDS} }
    }
  }
`;

const POST_QUERY = `
  query ProductHuntPost($slug: String!) {
    post(slug: $slug) { ${POST_FIELDS} }
  }
`;

function apiToken(ctx: ProductHuntContext, config: Config): string | undefined {
  return config.apiToken ?? ctx.secret?.(TOKEN_SECRET);
}

async function productHuntGraphQL<T>(
  ctx: ProductHuntContext,
  config: Config,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const token = apiToken(ctx, config);
  if (!token) throw new Error(`${TOKEN_SECRET} not in vault; pass config.apiToken or store the token`);
  const response = await fetch(config.baseUrl ?? API_URL, {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader(token),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: stripUndefined(variables),
    }),
  });

  const data = await readGraphQLResponse<T>(response);
  if (!response.ok) {
    throw new Error(`Product Hunt API request failed (${response.status}): ${graphqlErrorMessage(data, response.statusText)}`);
  }
  if (data.errors?.length) {
    throw new Error(`Product Hunt API error: ${graphqlErrorMessage(data, 'GraphQL error')}`);
  }
  if (!data.data) throw new Error('Product Hunt API response did not include data');
  return data.data;
}

async function readGraphQLResponse<T>(response: Response): Promise<ProductHuntGraphQLResponse<T>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as ProductHuntGraphQLResponse<T>;
  } catch {
    return { errors: [{ message: text }] };
  }
}

function authorizationHeader(token: string): string {
  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
}

function graphqlErrorMessage(data: ProductHuntGraphQLResponse<unknown>, fallback: string): string {
  return data.errors?.map((error) => error.message).filter(Boolean).join('; ') || fallback;
}

function boundedFirst(first: number): number {
  if (!Number.isInteger(first) || first < 1 || first > 50) {
    throw new Error('outreach-producthunt first must be an integer between 1 and 50');
  }
  return first;
}

function normalizePost(post: ProductHuntPostNode): ProductHuntPost {
  return stripUndefined({
    id: post.id,
    name: post.name,
    slug: post.slug,
    tagline: post.tagline,
    description: post.description ?? undefined,
    url: post.url,
    website: post.website ?? undefined,
    votesCount: post.votesCount,
    commentsCount: post.commentsCount,
    reviewsCount: post.reviewsCount,
    reviewsRating: post.reviewsRating,
    dailyRank: post.dailyRank ?? undefined,
    featuredAt: post.featuredAt ?? undefined,
    createdAt: post.createdAt,
    scheduledAt: post.scheduledAt ?? undefined,
    thumbnailUrl: post.thumbnail?.url ?? undefined,
    topics: post.topics?.nodes ?? [],
    makers: post.makers?.map((maker) => stripUndefined({
      username: maker.username ?? undefined,
      name: maker.name ?? undefined,
    })) ?? [],
  });
}

function launchChecklist(config: Config): string[] {
  return [
    `Slug: ${config.productSlug ?? '(new post)'}`,
    `Tagline: ${config.tagline ?? '(missing)'}`,
    `Topics: ${config.topics?.join(', ') || '(missing)'}`,
    `Makers: ${config.makers?.join(', ') || '(missing)'}`,
    `Gallery images: ${config.galleryImages?.length ?? 0}`,
    `First comment: ${config.firstComment ? 'ready' : 'missing'}`,
    `Schedule: ${config.scheduleFor?.toISOString() ?? 'now/manual'}`,
  ];
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
