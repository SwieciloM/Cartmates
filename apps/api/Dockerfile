FROM node:24.21.0-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN npm run db:generate && npm run build -w @cartmates/api

FROM build AS runtime
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
