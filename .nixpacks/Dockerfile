FROM ghcr.io/railwayapp/nixpacks:ubuntu-1745885067

ENTRYPOINT ["/bin/bash", "-l", "-c"]
WORKDIR /app/


COPY .nixpacks/nixpkgs-ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7.nix .nixpacks/nixpkgs-ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7.nix
RUN nix-env -if .nixpacks/nixpkgs-ffeebf0acf3ae8b29f8c7049cd911b9636efd7e7.nix && nix-collect-garbage -d


ARG CI NIXPACKS_METADATA NODE_ENV NPM_CONFIG_PRODUCTION
ENV CI=$CI NIXPACKS_METADATA=$NIXPACKS_METADATA NODE_ENV=$NODE_ENV NPM_CONFIG_PRODUCTION=$NPM_CONFIG_PRODUCTION

# setup phase
# noop

# install phase
ENV NIXPACKS_PATH=/app/node_modules/.bin:$NIXPACKS_PATH
COPY . /app/.
RUN --mount=type=cache,id=xrMbq0WIzsA-/root/local/share/pnpm/store/v3,target=/root/.local/share/pnpm/store/v3 npm install -g corepack@0.24.1 && corepack enable
RUN --mount=type=cache,id=xrMbq0WIzsA-/root/local/share/pnpm/store/v3,target=/root/.local/share/pnpm/store/v3 pnpm i --frozen-lockfile

# build phase
COPY . /app/.
RUN --mount=type=cache,id=xrMbq0WIzsA-boilerplates/next-plugin-store/next/cache,target=/app/boilerplates/next-plugin-store/.next/cache --mount=type=cache,id=xrMbq0WIzsA-boilerplates/next-supabase/next/cache,target=/app/boilerplates/next-supabase/.next/cache --mount=type=cache,id=xrMbq0WIzsA-boilerplates/perry-hono-supabase/apps/web/next/cache,target=/app/boilerplates/perry-hono-supabase/apps/web/.next/cache --mount=type=cache,id=xrMbq0WIzsA-node_modules/cache,target=/app/node_modules/.cache --mount=type=cache,id=xrMbq0WIzsA-sites/sh1ptcom/next/cache,target=/app/sites/sh1pt.com/.next/cache pnpm run build


RUN printf '\nPATH=/app/node_modules/.bin:$PATH' >> /root/.profile


# start
COPY . /app

CMD ["pnpm run start"]

