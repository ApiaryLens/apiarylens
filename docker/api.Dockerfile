FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
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
RUN pnpm --filter @apiarylens/server deploy --prod --legacy /runtime

FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime
LABEL org.opencontainers.image.title="ApiaryLens API" \
      org.opencontainers.image.version="0.1.0-rc.4" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV NODE_ENV=production \
    PORT=3000 \
    APIARYLENS_DATABASE=/data/apiarylens.sqlite
WORKDIR /workspace
RUN addgroup -S apiarylens && adduser -S -G apiarylens -u 10001 apiarylens && \
    rm -rf /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm \
      /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/pnpm /usr/local/bin/pnpx \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=build --chown=apiarylens:apiarylens /runtime /workspace
RUN mkdir -p /data && chown apiarylens:apiarylens /data
USER apiarylens
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
