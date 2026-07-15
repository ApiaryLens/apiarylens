FROM node:24.18.0-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/media/package.json packages/media/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/database packages/database
COPY packages/media packages/media
RUN pnpm --filter @apiarylens/server... build

FROM node:24.18.0-alpine AS runtime
LABEL org.opencontainers.image.title="ApiaryLens API" \
      org.opencontainers.image.version="0.1.0-rc.1" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV NODE_ENV=production \
    PORT=3000 \
    APIARYLENS_DATABASE=/data/apiarylens.sqlite
WORKDIR /workspace
RUN addgroup -S apiarylens && adduser -S -G apiarylens -u 10001 apiarylens && corepack enable
COPY --from=build --chown=apiarylens:apiarylens /workspace /workspace
RUN mkdir -p /data && chown apiarylens:apiarylens /data
USER apiarylens
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "--experimental-strip-types", "apps/api/dist/server.js"]
