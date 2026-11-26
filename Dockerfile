# Imagen de la app para publicarla (Railway la usa sola si encuentra este
# archivo; también sirve para cualquier servidor con Docker). Un solo servicio:
# la API sirve el front compilado en la misma dirección.
#
# Los secretos NO van acá: DATABASE_URL, SUPERADMIN_* y el resto se cargan en
# el panel del hosting. El .dockerignore deja afuera los .env y docs/.
FROM node:24-bookworm-slim

# Las migraciones de Prisma necesitan openssl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Primero las dependencias (así Docker las reusa si solo cambió el código).
# --include=dev: vite (para compilar el front) y el CLI de prisma (para las
# migraciones al arrancar) son dependencias de desarrollo.
COPY client/package.json client/package-lock.json client/
RUN cd client && npm ci --include=dev
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --include=dev

COPY client client
COPY server server

RUN cd client && npm run build
# prisma.config.ts pide DATABASE_URL, pero generar el cliente no se conecta a
# la base: alcanza una dirección de mentira.
RUN cd server && DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

WORKDIR /app/server
ENV NODE_ENV=production
# Migraciones y seed (idempotente; no pisa la contraseña del superadmin si ya
# existe) al arrancar, y después la API. El puerto lo pone el hosting (PORT).
CMD ["npm", "run", "start:prod"]
