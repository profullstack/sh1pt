import { defineSocial, oauthSetup } from '@profullstack/sh1pt-core';

const HASHNODE_API_URL = 'https://gql.hashnode.com';
const HASHNODE_TOKEN_SECRET = 'HASHNODE_API_TOKEN';
const PUBLISH_POST_MUTATION = `
mutation PublishPost($input: PublishPostInput!) {
  publishPost(input: $input) {
    post {
      id
      slug
      url
    }
  }
}
`;

type HashnodeGraphQLError = {
  message?: string;
};

type HashnodePublishResponse = {
  data?: {
    publishPost?: {
      post?: {
        id?: string;
        slug?: string;
        url?: string;
      };
    };
  };
  errors?: HashnodeGraphQLError[];
};

// Hashnode - GraphQL API at gql.hashnode.com. Personal blogs live on
// hashnode.dev subdomains or custom domains; posts are markdown with
// auto-SEO, RSS, newsletter. Auth: personal access token.
interface Config {
  publicationId: string;
  tags?: string[];              // max 5; each is an object id, not a label - resolve via tags query
  canonicalUrl?: string;
}

function buildContentMarkdown(post: { body: string; link?: string }): string {
  return post.link ? `${post.body}\n\n${post.link}` : post.body;
}

function buildPublishInput(post: { body: string; title?: string; link?: string }, config: Config): Record<string, unknown> {
  return {
    publicationId: config.publicationId,
    title: post.title,
    contentMarkdown: buildContentMarkdown(post),
    ...(config.tags?.length ? { tags: config.tags } : {}),
    ...(config.canonicalUrl ? { canonicalUrl: config.canonicalUrl } : {}),
  };
}

function authorizationHeader(token: string): string {
  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
}

export default defineSocial<Config>({
  id: 'social-hashnode',
  label: 'Hashnode',
  requires: { maxHashtags: 5, hashtagsInBody: false },
  async connect(ctx) {
    if (!ctx.secret(HASHNODE_TOKEN_SECRET)) throw new Error(`${HASHNODE_TOKEN_SECRET} not in vault`);
    return { accountId: 'hashnode' };
  },
  async post(ctx, post, config) {
    if (!post.title) throw new Error('Hashnode requires a title');
    const token = ctx.secret(HASHNODE_TOKEN_SECRET);
    if (!token) throw new Error(`${HASHNODE_TOKEN_SECRET} not in vault`);
    ctx.log(`hashnode post · ${config.publicationId} · "${post.title}"`);
    if (ctx.dryRun) {
      return { id: 'dry-run', url: 'https://hashnode.com/', platform: 'hashnode', publishedAt: new Date().toISOString() };
    }

    const response = await fetch(HASHNODE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: authorizationHeader(token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: PUBLISH_POST_MUTATION,
        variables: {
          input: buildPublishInput(post, config),
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Hashnode publish failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const payload = await response.json() as HashnodePublishResponse;
    const graphQLError = payload.errors?.find((error) => error.message)?.message;
    if (graphQLError) throw new Error(graphQLError);

    const publishedPost = payload.data?.publishPost?.post;
    const id = publishedPost?.id ?? publishedPost?.slug;
    const url = publishedPost?.url;
    if (!id || !url) throw new Error('Hashnode publish response did not include a post id and URL');

    return { id, url, platform: 'hashnode', publishedAt: new Date().toISOString() };
  },

  setup: oauthSetup({
    secretKey: 'HASHNODE_API_TOKEN',
    label: 'Hashnode',
    vendorDocUrl: 'https://hashnode.com/settings/developer',
    steps: [
      'Open hashnode.com/settings/developer -> Personal Access Tokens -> Generate New Token',
      'Copy the token (shown once)',
    ],
  }),
});
