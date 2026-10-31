/* =====================================================================
   Design | BNZ · Gestión personal — CONFIGURACIÓN
   ---------------------------------------------------------------------
   Sin completar: el sitio funciona igual, pero guarda solo en el
   navegador donde lo abrís (sin nube y sin IA).

   Completando SUPABASE_URL y SUPABASE_ANON_KEY (ver README, paso 2):
   - tus datos se guardan en la nube y se sincronizan en vivo entre la
     PC y el celular;
   - se entra sin contraseña: la primera vez en cada dispositivo te llega
     un link al email y después queda abierto.

   La clave "anon" PUEDE estar acá aunque el repositorio sea público:
   los datos los protege la seguridad por fila de supabase/schema.sql.
   NUNCA pongas acá la clave "service_role" ni tu clave de Anthropic.
   ===================================================================== */
window.BNZ_CONFIG = {
  SUPABASE_URL: '',          // ej: 'https://abcdxyzcompany.supabase.co'
  SUPABASE_ANON_KEY: '',     // Project Settings → API → "anon public"
  EMAIL: '',                 // tu email (el único que puede entrar), ej: 'proyectos@gmail.com'
  IA_ACTIVADA: false         // poné true después de desplegar la función "ia" (README, paso 3)
};
