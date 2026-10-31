// Función "ia": la llama el sitio para ordenar información y responder preguntas.
// Tu clave de Anthropic vive acá (secreto ANTHROPIC_API_KEY), nunca en el sitio.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { claude, env } from '../_shared/bnz.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  try {
    // Solo con sesión iniciada en el sitio, y solo tu email
    const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'Sesión no válida. Volvé a entrar.' }, 401);
    const permitido = env('BNZ_EMAIL');
    if (permitido && (user.email || '').toLowerCase() !== permitido.toLowerCase()) return json({ error: 'No autorizado' }, 403);

    const { messages, images } = await req.json();
    if (!Array.isArray(messages) || !messages.length) return json({ error: 'Falta el mensaje' }, 400);
    // deno-lint-ignore no-explicit-any
    const msgs: any[] = messages.slice(-20).map((m: { role: string; content: unknown }) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '') }));
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json({ error: 'El último mensaje tiene que ser tuyo' }, 400);
    if (JSON.stringify(msgs).length > 250_000) return json({ error: 'Es demasiado texto de una vez' }, 413);

    if (Array.isArray(images) && images.length) {
      const ultimo = msgs[msgs.length - 1];
      ultimo.content = [
        ...images.slice(0, 4).map((im: { media_type: string; data: string }) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type || 'image/jpeg', data: im.data } })),
        { type: 'text', text: ultimo.content },
      ];
    }
    const text = await claude(msgs);
    return json({ text });
  } catch (e) {
    const m = String((e as Error)?.message || e);
    return json({ error: m }, /rate|overloaded|429/i.test(m) ? 429 : 502);
  }
});
