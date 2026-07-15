FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
ARG APIARYLENS_SOURCE_COMMIT=development
ARG APIARYLENS_BUILD_TIME=development
ARG APIARYLENS_ARTIFACT_IDENTITY=ApiaryLens@0.1.0-rc.1+development
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN pnpm --filter @apiarylens/contracts build && \
    VITE_DEPLOYMENT_PROFILE=compose \
    VITE_SOURCE_COMMIT="$APIARYLENS_SOURCE_COMMIT" \
    VITE_BUILD_TIME="$APIARYLENS_BUILD_TIME" \
    VITE_ARTIFACT_IDENTITY="$APIARYLENS_ARTIFACT_IDENTITY" \
    pnpm --filter @apiarylens/web build

FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d
LABEL org.opencontainers.image.title="ApiaryLens PWA" \
      org.opencontainers.image.version="0.1.0-rc.1" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/web/dist /srv
EXPOSE 80 443
