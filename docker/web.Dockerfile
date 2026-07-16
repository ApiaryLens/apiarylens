FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
ARG APIARYLENS_SOURCE_COMMIT=development
ARG APIARYLENS_BUILD_TIME=development
ARG APIARYLENS_ARTIFACT_IDENTITY=ApiaryLens@0.1.0-rc.4+development
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

FROM golang:1.26.5-alpine@sha256:0178a641fbb4858c5f1b48e34bdaabe0350a330a1b1149aabd498d0699ff5fb2 AS caddy-build
ENV CGO_ENABLED=0
RUN GOBIN=/out go install -trimpath -ldflags="-s -w -buildid=" github.com/caddyserver/caddy/v2/cmd/caddy@v2.11.4 && \
    mkdir -p /runtime/config /runtime/data /runtime/srv /runtime/etc/caddy /runtime/etc/ssl/certs && \
    cp /etc/ssl/certs/ca-certificates.crt /runtime/etc/ssl/certs/ca-certificates.crt && \
    chown -R 10001:10001 /runtime/config /runtime/data /runtime/srv

FROM scratch
LABEL org.opencontainers.image.title="ApiaryLens PWA" \
      org.opencontainers.image.version="0.1.0-rc.4" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV XDG_CONFIG_HOME=/config \
    XDG_DATA_HOME=/data
COPY --from=caddy-build /out/caddy /usr/bin/caddy
COPY --from=caddy-build /runtime/ /
COPY --chown=10001:10001 --chmod=0444 docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=10001:10001 /workspace/apps/web/dist /srv
USER 10001:10001
EXPOSE 80 443
ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
