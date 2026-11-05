# Imagen del backend para Cloud Run.
#   docker build -t kuota-backend backend/
# Producción: DATABASE_URL (usuario del núcleo), PAYMENTS_DATABASE_URL (usuario
# de pagos) y los secretos KUOTA_* desde Secret Manager. Las migraciones corren
# antes del despliegue con: node dist/db/migrate-cli.js (usuario dueño).

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    KUOTA_AUTO_MIGRATE=0 \
    KUOTA_TRUST_PROXY=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
