# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js styles.css ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM mcr.microsoft.com/powershell:lts-debian-bookworm

# Debian 12 ships SQLite 3.40. Catalog SQL needs json_group_array(... ORDER BY), which arrived in 3.44.
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential ca-certificates curl \
  && curl -fsSL -o /tmp/sqlite.tar.gz https://www.sqlite.org/2026/sqlite-autoconf-3540000.tar.gz \
  && tar -xzf /tmp/sqlite.tar.gz -C /tmp \
  && cd /tmp/sqlite-autoconf-3540000 \
  && ./configure --disable-static --prefix=/usr/local \
  && make -j"$(nproc)" \
  && make install \
  && ldconfig \
  && rm -rf /tmp/sqlite.tar.gz /tmp/sqlite-autoconf-3540000 \
  && apt-get purge -y build-essential curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

ENV LD_LIBRARY_PATH=/usr/local/lib

WORKDIR /app
COPY serve.ps1 favicon.svg ./
COPY db ./db
COPY ai ./ai
COPY images ./images
COPY --from=web /src/dist ./dist

ENV SITE_HOST=+
ENV SITE_PORT=8787
EXPOSE 8787
VOLUME ["/app/data"]

ENTRYPOINT ["pwsh", "-NoLogo", "-NoProfile", "-File", "/app/serve.ps1"]
