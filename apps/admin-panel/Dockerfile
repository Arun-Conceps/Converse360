FROM node:22-alpine AS base

# Prisma's query engine needs openssl.
RUN apk add --no-cache openssl

WORKDIR /app

# Copy root monorepo files
COPY package.json package-lock.json turbo.json ./
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/typescript-config/base.json ./packages/typescript-config/base.json

# @repo/database is a workspace dependency, so its manifest has to be in place
# before `npm ci` can resolve the link.
COPY packages/database/package.json ./packages/database/package.json

# Copy admin-panel package.json
COPY apps/admin-panel/package.json ./apps/admin-panel/package.json

# Install dependencies
RUN npm ci

# Copy the schema first and generate Prisma Client to leverage caching
COPY packages/database ./packages/database
RUN npm run generate --workspace=@repo/database

# Runtime configuration comes from docker-compose `env_file`; the panel has no
# NEXT_PUBLIC_ values to bake and every page is dynamic, so the build does not
# need secrets. The repo-root .dockerignore excludes apps/admin-panel/.env* so
# they never land in an image layer; this wildcard then matches nothing (or only
# .env.local.example), which BuildKit accepts. If a build ever needs a value,
# pass it as a build arg rather than un-ignoring the env file.
COPY apps/admin-panel/.env.local* ./apps/admin-panel/

# Copy the rest of the workspace files
COPY apps/admin-panel ./apps/admin-panel
COPY packages ./packages

RUN npm run build --workspace=admin-panel

# Production stage
FROM node:22-alpine AS production
WORKDIR /app

RUN apk add --no-cache openssl

# Copy the entire build context to preserve all workspace node_modules and symlinks
COPY --from=base /app ./

EXPOSE 3002
CMD ["npm", "run", "start", "--workspace=admin-panel"]
