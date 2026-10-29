FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY supabase ./supabase
RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 FILE_ROOT=/data/files
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/server ./dist/server
COPY --from=build --chown=node:node /app/supabase ./supabase
COPY --chown=node:node package.json ./
RUN mkdir -p /data/files && chown -R node:node /data
USER node
EXPOSE 3001
CMD ["node","dist/server/apps/api/server.js"]

FROM caddy:2.10-alpine AS gateway
COPY --from=build /app/dist/web /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
