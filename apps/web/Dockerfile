# Web image: build the Vite SPA, serve the static output with nginx.
# Build context is the repo root so the npm workspace lockfile resolves.
#   docker build -t voira-web -f apps/web/Dockerfile .

# ---- build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Install dependencies against the root lockfile first for layer caching.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# Build the SPA. VITE_* values are baked in at build time, so they are passed
# as build args. They are public values (anon key, API URL), never secrets.
COPY apps/web apps/web
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ARG VITE_API_BASE_URL="http://localhost:8000"
ARG VITE_TRANSCRIPTION_WS_URL=""
ARG VITE_STRIPE_PUBLISHABLE_KEY=""
ARG VITE_STRIPE_PRICE_ID_MONTHLY=""
ARG VITE_STRIPE_PRICE_ID_YEARLY=""
ARG VITE_SENTRY_DSN=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_TRANSCRIPTION_WS_URL=$VITE_TRANSCRIPTION_WS_URL \
    VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY \
    VITE_STRIPE_PRICE_ID_MONTHLY=$VITE_STRIPE_PRICE_ID_MONTHLY \
    VITE_STRIPE_PRICE_ID_YEARLY=$VITE_STRIPE_PRICE_ID_YEARLY \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build --workspace apps/web

# ---- runtime stage ----
# Unprivileged nginx: runs as uid 101 and listens on 8080 without root, which
# matches the securityContext in infra/k8s/web-deployment.yaml.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
