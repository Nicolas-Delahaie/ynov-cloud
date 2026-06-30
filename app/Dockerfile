# syntax=docker/dockerfile:1

# --- deps: dépendances de PRODUCTION (NODE_ENV=production → npm ci omet les devDeps) ---
FROM node:20-alpine AS deps
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci

# --- test: dépendances COMPLÈTES (jest & co) pour lancer la suite en conteneur ---
FROM node:20-alpine AS test
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npm", "test"]

# --- prod: image finale, prod uniquement, non-root ---
FROM node:20-alpine AS prod
LABEL org.opencontainers.image.source=https://github.com/Nicolas-Delahaie/ynov-cloud
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health/db || exit 1
CMD ["node", "main.js"]
