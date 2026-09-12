# terra-admin: SPA de Vite servida por nginx.
#
# Dos etapas: Node compila, nginx sirve. La imagen final no lleva Node, ni
# node_modules, ni el código fuente: sólo el `dist/` estático.

# --------------------------------------------------------------------- build
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite incrusta las VITE_* en el bundle AL COMPILAR, no al arrancar: cambiarlas
# en Railway exige un rebuild, no un restart. Y Railway sólo las pasa al build
# si el Dockerfile las declara con ARG.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GEOCORE_URL

# Falla el build si falta alguna. Sin esto, el bundle sale con `undefined` en
# las URLs, el sitio carga, y el login falla sin decir por qué — el mismo modo
# de fallo que el resto de la plataforma dejó de aceptar.
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" && test -n "$VITE_GEOCORE_URL" \
    || (echo "ERROR: faltan VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY o VITE_GEOCORE_URL en el build" && exit 1)

RUN npm run build

# ------------------------------------------------------------------- runtime
FROM nginx:1.27-alpine

# La imagen oficial pasa /etc/nginx/templates/*.template por envsubst al
# arrancar, sólo con las variables que existen en el entorno: ${PORT} se
# reemplaza y los $uri de nginx quedan intactos.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Railway inyecta PORT. El default es para correrlo local.
ENV PORT=8080
EXPOSE 8080
