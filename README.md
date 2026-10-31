# Design | BNZ · Gestión personal

Sitio personal de **Benjamín Nuñez** (Design | BNZ · Diseño · Visualización · Tecnología) para manejar:

- **Tareas** de hoy, corto y largo plazo, por área (Municipalidad, Profesorado, arquitectos, Informática…).
- **Economía**: ingresos y gastos fijos, servicios, movimientos del día a día, caja de ahorro, metas, deudas y lista de compras.
- **Cronograma**: calendario, actividades que se repiten cada semana y recordatorios.
- **Presupuestos**: generador con historial y descarga en PDF.
- **Asistente IA**: le pegás un chat, notas o una captura y la IA lo ordena en tareas, fechas, gastos y cobros.
- **WhatsApp** (opcional): le escribís al bot y te agenda las cosas y te avisa antes de cada evento.

Funciona en PC, tablet y celular, y se puede instalar como app.

---

## Qué hay en esta carpeta

```
index.html              La app (todo el diseño y la lógica)
config.js               ← Lo único que tenés que editar (claves de Supabase)
puente.js               Conecta la app con Supabase (nube, acceso, IA)
manifest.webmanifest    Para instalarla como app en el celular
sw.js                   Permite abrirla sin internet
icons/                  Íconos de la app
supabase/
  schema.sql            Tablas y seguridad de la base de datos
  cron.sql              Recordatorios automáticos (WhatsApp)
  config.toml           Configuración de las funciones
  functions/ia/           IA (tu clave de Anthropic queda acá, no en el sitio)
  functions/whatsapp/     Bot de WhatsApp
  functions/recordatorios/ Avisos programados
```

El sitio funciona en tres niveles. Cada paso suma algo y podés frenar en cualquiera:

| Hasta el paso | Qué tenés |
|---|---|
| 1 · GitHub Pages | El sitio online. Guarda en el navegador de cada dispositivo. |
| 2 · Supabase | Nube, sincronización PC ↔ celular, copias diarias y acceso sin contraseña. |
| 3 · IA | El asistente que ordena lo que le escribís. |
| 4 · WhatsApp | Bot que recibe tus mensajes y te manda recordatorios. |

---

## Paso 1 · Publicarlo en GitHub Pages (gratis, 10 minutos)

**Desde la web (lo más fácil):**

1. Entrá a <https://github.com> y creá una cuenta si no tenés.
2. Arriba a la derecha: **+ → New repository**.
   - Nombre: `bnz-gestion`
   - Visibilidad: **Public** (GitHub Pages es gratis en repos públicos; para privados necesitás GitHub Pro). Tranquilo: **tus datos nunca van al repositorio**, solo el código.
   - Tocá **Create repository**.
3. En el repo nuevo: **uploading an existing file** (o **Add file → Upload files**). Arrastrá **todo el contenido** de esta carpeta (los archivos y las carpetas `icons` y `supabase`). Abajo, **Commit changes**.
4. **Settings → Pages**. En *Build and deployment*: Source **Deploy from a branch**, Branch **main** y carpeta **/ (root)** → **Save**.
5. En 1 o 2 minutos aparece tu link: `https://TU-USUARIO.github.io/bnz-gestion/`

**Con la terminal (si usás git):**

```bash
cd bnz-gestion
git init
git add .
git commit -m "Primera versión de Design | BNZ Gestión"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/bnz-gestion.git
git push -u origin main
```

Después hacé el punto 4 de arriba para activar Pages.

> Con solo este paso el sitio ya funciona, pero guarda en el navegador de cada dispositivo (lo que cargues en la PC no aparece en el celular). Para eso está el paso 2.

---

## Paso 2 · Nube y acceso sin contraseña (Supabase, gratis)

1. Entrá a <https://supabase.com> → **New project**. Nombre `bnz-gestion`, región **South America (São Paulo)**. Guardá la contraseña de la base que te pide (no la vas a usar en el sitio).
2. Menú **SQL Editor → New query** → pegá todo `supabase/schema.sql` → **Run**.
3. **Authentication → Users → Add user → Create new user**: tu email, cualquier contraseña larga (no la vas a usar) y tildá **Auto Confirm User**.
4. **Authentication → Sign In / Providers**: dejá **Email** activado y **desactivá "Allow new users to sign up"**. Así nadie más puede crearse una cuenta.
5. **Authentication → URL Configuration**:
   - **Site URL**: `https://TU-USUARIO.github.io/bnz-gestion/`
   - **Redirect URLs** → Add URL: la misma dirección.
6. **Project Settings → API** (o *Data API* / *API Keys*): copiá **Project URL** y la clave **anon public**.
7. En GitHub abrí `config.js` → ícono del lápiz → completá:

   ```js
   SUPABASE_URL: 'https://tu-proyecto.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...',
   EMAIL: 'tu@email.com',
   ```

   → **Commit changes**. En un minuto se actualiza el sitio.
8. Abrí tu sitio, poné tu email y tocá **Mandarme el link**. Abrí el link del email **en el mismo dispositivo** y listo: queda abierto. Hacé lo mismo una vez en el celular.

**Instalarlo como app en el celular:** abrí el sitio en Chrome → menú ⋮ → **Agregar a la pantalla principal** (en iPhone: Safari → Compartir → **Agregar a inicio**).

> La clave *anon* puede estar en `config.js` aunque el repo sea público: la base solo deja leer y escribir a tu usuario (seguridad por fila de `schema.sql`). **Nunca** pongas en el repo la clave *service_role* ni tu clave de Anthropic.
>
> En el plan gratis, Supabase pausa el proyecto si pasa una semana sin uso. Si te pasa, entrá al panel y tocá **Restore**: no se pierde nada.

---

## Paso 3 · Asistente IA (opcional, se paga por uso)

La IA usa la API de Anthropic (Claude). Tu clave queda guardada en Supabase, nunca en el sitio.

1. Entrá a <https://console.anthropic.com> → creá una **API key** y cargá crédito (se cobra por uso; para uso personal es poco, pero revisá los precios ahí).
2. Instalá [Node.js](https://nodejs.org) si no lo tenés. Abrí una terminal **dentro de esta carpeta** y corré:

   ```bash
   npx supabase login
   npx supabase link --project-ref TU-PROYECTO
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx BNZ_EMAIL=tu@email.com
   npx supabase functions deploy ia
   ```

   `TU-PROYECTO` es el código que aparece en la URL de Supabase (`https://supabase.com/dashboard/project/ESTE-CODIGO`).
3. En `config.js` cambiá `IA_ACTIVADA: false` por `IA_ACTIVADA: true` → commit.

Opcional: `npx supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5` para elegir otro modelo.

---

## Paso 4 · Bot de WhatsApp (opcional, avanzado)

Qué hace:
- Le escribís al bot *"mañana 10 hs entrego planos Morumbí, gasté 8 mil en tinta"* (o le mandás una captura) → lo ordena y lo guarda en tu gestión, y te confirma qué agendó.
- **hoy** → te manda el resumen del día. **ayuda** → ejemplos.
- Todas las mañanas (08:00) te manda el resumen, y te avisa **60 minutos antes** de cada evento con hora.

Necesitás el paso 3 hecho y una cuenta de Meta for Developers. El bot usa un número propio (Meta te da uno de prueba gratis que sirve para uso personal).

1. <https://developers.facebook.com> → **Mis apps → Crear app** → tipo **Empresa (Business)** → agregá el producto **WhatsApp**.
2. En **WhatsApp → API Setup**: anotá el **Phone number ID** del número de prueba. En **To**, agregá tu número personal y verificalo con el código que te llega.
3. **Token permanente**: en <https://business.facebook.com> → Configuración → **Usuarios del sistema** → crear uno (Admin) → **Asignar activos** (tu app) → **Generar token** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
4. **App secret**: en tu app → **Configuración → Básica → Clave secreta de la app**.
5. **Tu ID de usuario**: Supabase → **Authentication → Users** → copiá el **UID** de tu usuario.
6. En la terminal, dentro de esta carpeta:

   ```bash
   npx supabase secrets set WA_TOKEN=EAAG... WA_PHONE_ID=1234567890 WA_APP_SECRET=abc123 \
     WA_VERIFY_TOKEN=inventa-una-frase WA_MI_NUMERO=5493756XXXXXX \
     BNZ_USER_ID=el-uid-de-tu-usuario CRON_SECRET=otra-frase-larga-inventada
   npx supabase functions deploy whatsapp --no-verify-jwt
   npx supabase functions deploy recordatorios --no-verify-jwt
   ```

   `WA_MI_NUMERO` es tu número con código de país, sin `+`, sin `0` y sin `15` (ej.: `5493756123456`). Si Meta te dice *"Recipient phone number not in allowed list"*, probá cargarlo en el panel y en `WA_MI_NUMERO` sin el `9` (`543756123456`).
7. **Webhook**: en tu app → **WhatsApp → Configuración → Webhook → Editar**:
   - Callback URL: `https://TU-PROYECTO.supabase.co/functions/v1/whatsapp`
   - Verify token: la misma frase de `WA_VERIFY_TOKEN`
   - **Verificar y guardar**, y en *Campos del webhook* suscribite a **messages**.
8. Probá: desde tu WhatsApp mandale **ayuda** al número del bot.
9. **Recordatorios automáticos**: abrí `supabase/cron.sql`, reemplazá `TU-PROYECTO` y `TU_SECRETO` (el mismo `CRON_SECRET`) y corrélo en el **SQL Editor**.
   Opcional: `npx supabase secrets set HORA_RESUMEN=07:30 AVISO_MINUTOS=30`.

**La regla de las 24 horas de WhatsApp:** Meta solo deja que el bot te escriba texto libre dentro de las 24 h siguientes a tu último mensaje. Dos opciones:
- Escribile **hoy** al bot cada mañana (te devuelve el resumen y abre la ventana para los avisos del día).
- O creá una plantilla: **WhatsApp Manager → Plantillas de mensajes → Crear** → categoría **Utilidad**, nombre `recordatorio`, idioma Español (ARG), cuerpo `Recordatorio de tu gestión: {{1}}`. Cuando la aprueben: `npx supabase secrets set WA_PLANTILLA=recordatorio WA_PLANTILLA_IDIOMA=es_AR`. Los mensajes con plantilla pueden tener costo según Meta.

---

## Paso 5 · Traer tus datos desde la versión de Claude

1. En el sitio de Claude: **Ajustes y copias → Guardar copia en la PC** (se baja un `.json`).
2. En tu sitio de GitHub (ya con el paso 2 hecho): **Ajustes y copias → Restaurar desde archivo** y elegí ese archivo.

---

## Actualizar el sitio

Cualquier cambio que subas a GitHub (editar un archivo y *Commit*) se publica solo en uno o dos minutos. Tus datos no se tocan: están en Supabase.

## Copias de seguridad

- **Nube:** una copia completa por día, se guardan las últimas 14 (Ajustes → Copias en la nube → Restaurar).
- **Tu PC:** Ajustes → **Guardar copia en la PC**. El sitio te avisa si pasa una semana sin hacerla. El archivo no está cifrado: guardalo en una carpeta privada (nunca en el repositorio; `.gitignore` ya lo evita).

## Problemas comunes

| Problema | Solución |
|---|---|
| "Signups not allowed for otp" al pedir el link | Falta crear tu usuario (paso 2, punto 3) o el email no coincide. |
| El link del email abre pero vuelve a pedir el email | Revisá **Site URL** y **Redirect URLs** (paso 2, punto 5). Abrí el link en el mismo navegador. |
| "La IA todavía no está activada" | Falta `IA_ACTIVADA: true` en `config.js` o desplegar la función `ia`. |
| La IA responde "Sesión no válida" | Cerrá sesión (Ajustes) y volvé a entrar. |
| El bot no responde | Revisá en Supabase → **Edge Functions → whatsapp → Logs**, y que el webhook esté suscrito a *messages*. |
| No veo los cambios nuevos | Recargá con Ctrl + F5 (en el celular, cerrá y abrí la app). |
