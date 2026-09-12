# Desplegar terra-admin en Railway

## ¿Railway, o un hosting estático?

terra-admin es una SPA de Vite: HTML, JS y CSS estáticos. Un hosting estático con CDN
(Vercel, Cloudflare Pages, Netlify) le queda naturalmente, y el plan gratis alcanza.

**Se eligió Railway** para tener un solo lugar donde mirar deploys, variables y logs de
los cuatro servicios. El costo es chico: la imagen es nginx sirviendo archivos. Si algún
día el panel lo usan clientes y no sólo el staff, una CDN adelante empieza a valer la pena.

## Antes de empezar

1. **Sacar el proyecto de OneDrive.** Git y la sincronización de OneDrive se pisan: OneDrive
   puede bloquear o duplicar archivos de `.git` mientras git escribe. Moverlo junto a los
   otros repos (`Downloads/terra-admin`, por ejemplo). El historial viaja con la carpeta.
2. **Crear el repo en GitHub**, privado, en la cuenta de la organización
   (`TechSupportKaapeh/terra-admin`), vacío: sin README ni licencia.
3. Subirlo:

   ```bash
   git remote add origin https://github.com/TechSupportKaapeh/terra-admin.git
   git push -u origin main
   ```

## En Railway

1. **New Service → GitHub Repo → terra-admin.** Railway detecta el `Dockerfile`.
2. **Variables**, las tres obligatorias:

   | Variable | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | la anon key del proyecto de Supabase |
   | `VITE_GEOCORE_URL` | `https://<geocore>.up.railway.app` — **no** la URL de ngrok de desarrollo |

   Son de **build**, no de runtime: Vite las incrusta en el bundle al compilar. Cambiar una
   exige redesplegar, no reiniciar. Si falta alguna, el build falla a propósito: un bundle
   con `undefined` en las URLs carga igual y el login falla sin decir por qué.
3. **Settings → Networking → Generate Domain.**
4. Healthcheck: `/` (nginx responde el `index.html`).

## Lo que hay que tocar en los otros servicios

| Dónde | Qué | Por qué |
|---|---|---|
| Geocore | `Cors__Origins__N = https://<panel>.up.railway.app` | Sin esto el navegador bloquea toda llamada a la API. Exacto: sin barra final, con `https`. |
| Geocore | `Worker__BaseUrl = https://<worker>.up.railway.app` | La pestaña Diagnóstico sondea el `/health` del worker desde Geocore. Sin ella, sale "sin configurar". |
| Supabase | Authentication → URL Configuration: agregar el dominio del panel | Los links de los mails (reset de contraseña, invitaciones) tienen que volver al panel. |

## Seguridad

- **La anon key de Supabase es pública por diseño**: va en el bundle y cualquiera la lee.
  Lo que protege los datos es RLS en Supabase y la autorización de Geocore. **Nunca** la
  `service_role` key en una variable `VITE_*`.
- **El gate por rol del panel es cosmético** (`[B-2]` en `App.tsx`): decodifica el JWT sin
  verificar la firma. Oculta pantallas; no protege nada. Lo que protege es Geocore.
- **La pestaña Diagnóstico es sólo para TerraAdmin.** TerraSupport no la ve, y si llamara
  al endpoint a mano recibiría 403: la política `TerraAdmin` vive en Geocore
  (`DECISIONS #19`).
- nginx manda `X-Content-Type-Options`, `X-Frame-Options: DENY` y `Referrer-Policy`. No
  `no-referrer`: los tiles de OpenStreetMap que usan los mapas de ranchos exigen Referer.

## Verificación después del deploy

1. Abrir el dominio: carga el login.
2. Entrar con un **TerraAdmin**: aparecen cuatro pestañas, la última es Diagnóstico.
   **Correr diagnóstico**: las dos bases, la configuración, el tileserver y el worker en `ok`.
3. En Diagnóstico → Tiles: elegir un tenant y una capa. Tiene que pintarse.
4. Entrar con un **TerraSupport**: tres pestañas, sin Diagnóstico.

Si el login funciona pero toda llamada falla con un error de CORS en la consola, falta el
origen en Geocore, o está escrito distinto: el rechazo devuelve 204 sin la cabecera y
Geocore no loguea nada.

## Probarlo local con Docker

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon key> \
  --build-arg VITE_GEOCORE_URL=https://<geocore>.up.railway.app \
  -t terra-admin .
docker run --rm -p 8080:8080 terra-admin
```

`.env.local` no entra en la imagen (`.dockerignore`): Vite lo cargaría también al compilar
para producción y el bundle saldría con los valores de desarrollo.
