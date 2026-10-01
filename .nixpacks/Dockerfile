# dev2 builds this file (cli-tools dev2/dev2-site: compose builds .nixpacks/Dockerfile from the
# repo root). nixpacks' generated Dockerfile cannot build sh1pt.com: it installs the whole
# 555-package workspace on node 18 and never builds the workspace packages the site
# depends on (@profullstack/sh1pt-action-packs, ...). This is sites/sh1pt.com/Dockerfile,
# the one Railway built; keep the two in sync.

# syntax=docker/dockerfile:1.6
# Dockerfile for sh1pt.com — built from the monorepo root.
# Reason for existing: Railpack's auto-generated COPY-per-workspace-package
# exceeds BuildKit's mount-options length limit (~344 workspace packages).
# A single bulk COPY sidesteps that.
#
# Runtime: Bun. pnpm stays the workspace package manager (555 packages, and the
# npm release pipeline relies on pnpm's workspace: rewriting), so only the install
# below runs on Node; Next builds with `bun --bun next build` and serves with
# `bun --bun next start` on oven/bun.

FROM oven/bun:1.4.0-slim AS bun

FROM node:20-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@9.12.0
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY . .

# Replace the workspace file with a minimal one covering only sh1pt-dot-com's
# transitive closure. Otherwise pnpm scans all 555 workspace packages, which
# OOMs the build container.
RUN printf 'packages:\n  - sites/sh1pt.com\n  - packages/core\n  - packages/cli\n  - packages/policy\n  - packages/openapi\n  - packages/actions-fleet-core\n  - packages/actions\n  - packages/automation/browser\n  - packages/secrets/env-updater\n' > pnpm-workspace.yaml

# Next probes the app env file during build. The real values arrive at runtime
# from app.env, so an empty file keeps container builds deterministic.
RUN touch sites/sh1pt.com/.env

# Public build-time values dev2's compose passes as build args.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN pnpm --filter sh1pt-dot-com... install --frozen-lockfile=false
RUN pnpm --filter sh1pt-dot-com^... --if-present build
# The site's build script is `bun --bun next build`: Next builds on Bun.
RUN pnpm --filter sh1pt-dot-com build

FROM oven/bun:1.4.0-slim AS runner

ENV NODE_ENV=production

WORKDIR /app

# uid 1000, the same as the node user the Node image ran as.
COPY --from=build --chown=bun:bun /app /app

EXPOSE 8080
USER bun
CMD ["sh", "-c", "cd sites/sh1pt.com && exec bun --bun node_modules/next/dist/bin/next start -p ${PORT:-8080} -H 0.0.0.0"]
