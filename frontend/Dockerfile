# Multi-stage build. docker-compose's dev profile builds the `dev` target (hot
# reload via `npm run dev`, source bind-mounted in). Building the image with no
# `--target` (the default: a plain `docker build .`, or any deployment platform)
# gets the `runner` stage instead — a compiled `next build` served via `next
# start`'s minimal standalone server, which is what makes production loads fast
# instead of compiling each route on first visit like dev mode does.

FROM node:20-alpine AS base
# next/image's sharp dependency needs these on Alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM deps AS builder
# NEXT_PUBLIC_* vars are inlined into the browser bundle at build time, not
# read at container start — must be passed as a build arg, not just env_file.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
