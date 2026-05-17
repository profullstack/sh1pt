# syntax=docker/dockerfile:1.6
# Dockerfile for sh1pt.com — built from the monorepo root.
# Reason for existing: Railpack's auto-generated COPY-per-workspace-package
# exceeds BuildKit's mount-options length limit (~344 workspace packages).
# A single bulk COPY sidesteps that.

FROM node:20-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY . .

# Replace the workspace file with a minimal one covering only sh1pt-dot-com's
# transitive closure. Otherwise pnpm scans all 555 workspace packages, which
# OOMs the build container.
RUN printf 'packages:\n  - sites/sh1pt.com\n  - packages/core\n  - packages/cli\n  - packages/policy\n' > pnpm-workspace.yaml

RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter sh1pt-dot-com build

FROM node:20-bookworm-slim AS runner

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
RUN corepack enable

WORKDIR /app

COPY --from=build --chown=node:node /app /app

EXPOSE 8080
USER node
CMD ["pnpm", "--filter", "sh1pt-dot-com", "start"]
