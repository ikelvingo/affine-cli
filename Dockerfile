# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: compile TypeScript -> dist/index.js
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json build.js ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage: production deps only + built bundle + CLI bin + skill
# ---------------------------------------------------------------------------
FROM node:24-alpine
LABEL org.opencontainers.image.title="affine-cli" \
      org.opencontainers.image.description="AFFiNE CLI with the affine-cli agent skill" \
      org.opencontainers.image.source="https://github.com/woodcoal/affine-cli"

WORKDIR /app
ENV NODE_ENV=production

# Runtime dependencies for the externals left unbundled by esbuild
# (socket.io-client, yjs, form-data, fractional-indexing, markdown-it, nanoid,
#  node-fetch, undici)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY bin ./bin
COPY skill ./skill

# Expose `affine-cli` on PATH (npm link is lighter than a global install)
RUN chmod +x bin/affine-cli && npm link && npm cache clean --force

# Make the skill discoverable at the common personal-skills path
RUN mkdir -p /root/.agents/skills \
 && ln -sfn /app/skill /root/.agents/skills/affine-cli

# Non-interactive defaults are provided via environment variables, e.g.:
#   -e AFFINE_BASE_URL=https://affine.example.com \
#   -e AFFINE_EMAIL=me@example.com -e AFFINE_PASSWORD=secret \
#   -e AFFINE_WORKSPACE_ID=<id>
# or a pre-obtained session cookie:
#   -e AFFINE_COOKIE='affine_session=...; affine_csrf_token=...'

ENTRYPOINT ["affine-cli"]
CMD ["--help"]
