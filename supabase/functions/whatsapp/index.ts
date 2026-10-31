// Función "whatsapp": recibe tus mensajes de WhatsApp (webhook de Meta),
// los ordena con la IA, los guarda en tu gestión y te responde.
// Comandos: "hoy" (resumen del día) · "ayuda".
import { admin, aplicar, AREAS_DEF, claude, enviarWA, env, guardarDoc, leerDocs, limpiar, parsearJSON, promptOrdenar, resumenDia, soloDigitos } from '../_shared/bnz.ts';

// deno-lint-ignore no-explicit-any
type Any = any;
const enc = new TextEncoder();
// En Argentina WhatsApp a veces usa 549… y a veces 54…: se comparan igual
const normAR = (s: string) => { const d = soloDigitos(s); return d.startsWith('549') ? '54' + d.slice(3) : d; };

async function firmaValida(req: Request, cuerpo: string) {
  const secreto = env('WA_APP_SECRET');
  if (!secreto) return true;
  const firma = req.headers.get('x-hub-signature-256') || '';
  const key = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(cuerpo)));
  const hex = [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  return firma === 'sha256=' + hex;
}

async function descargarImagen(id: string) {
  const v = env('WA_GRAPH_VERSION', 'v21.0'), auth = { Authorization: `Bearer ${env('WA_TOKEN')}` };
  const meta = await (await fetch(`https://graph.facebook.com/${v}/${id}`, { headers: auth })).json();
  const buf = new Uint8Array(await (await fetch(meta.url, { headers: auth })).arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { media_type: meta.mime_type || 'image/jpeg', data: btoa(s) };
}

const AYUDA = `🤖 *Asistente Design | BNZ*
Mandame lo que tengas y lo ordeno en tu gestión:
• "Mañana 10 hs entrego planos Morumbí"
• "Gasté 8 mil en tinta" / "Julieta me pagó 90 mil"
• "Le debo 5 lucas a Brian"
• Una captura de un chat o de una lista

Comandos: *hoy* (resumen del día) · *ayuda*`;

async function procesar(mensajes: Any[]) {
  const sb = admin(), userId = env('BNZ_USER_ID'), mio = normAR(env('WA_MI_NUMERO'));
  if (!userId || !mio) return;
  const docs = await leerDocs(sb, userId, ['perfil', 'wa']);
  const wa = { procesados: [] as string[], ...(docs.wa || {}) };
  for (const msg of mensajes) {
    if (normAR(msg.from) !== mio) continue;                // solo vos
    if (wa.procesados.includes(msg.id)) continue;          // Meta a veces reintenta
    wa.procesados = [...wa.procesados, msg.id].slice(-60);
    await guardarDoc(sb, userId, 'wa', wa);
    try {
      let texto = '', imagen: Any = null;
      if (msg.type === 'text') texto = msg.text?.body || '';
      else if (msg.type === 'image') { imagen = await descargarImagen(msg.image.id); texto = msg.image.caption || ''; }
      else if (msg.type === 'audio') { await enviarWA('🎙️ Por ahora no entiendo audios. Mandámelo escrito o como captura.'); continue; }
      else continue;
      const cmd = texto.trim().toLowerCase();
      if (!imagen && ['hoy', 'resumen', 'agenda', 'qué tengo hoy', 'que tengo hoy'].includes(cmd)) {
        await enviarWA(resumenDia(await leerDocs(sb, userId, ['tareas', 'eventos'])));
        continue;
      }
      if (!imagen && ['ayuda', 'help', 'hola', 'menu', 'menú'].includes(cmd)) { await enviarWA(AYUDA); continue; }
      const areas = docs.perfil?.areas?.length ? docs.perfil.areas : AREAS_DEF;
      const prompt = promptOrdenar(texto, areas, docs.perfil?.nombre || '', !!imagen);
      const content = imagen ? [{ type: 'image', source: { type: 'base64', ...imagen } }, { type: 'text', text: prompt }] : prompt;
      const r = limpiar(parsearJSON(await claude([{ role: 'user', content }])), areas);
      const partes = await aplicar(sb, userId, r, texto || '(captura)');
      if (!partes.length) { await enviarWA(`🤔 No encontré nada para guardar.${r.notas.length ? '\nNotas: ' + r.notas.join(' · ') : ''}\nEscribí *ayuda* para ver ejemplos.`); continue; }
      const lineas = [
        ...r.eventos.map(e => `📅 ${e.titulo} — ${e.fecha.slice(8, 10)}/${e.fecha.slice(5, 7)}${e.hora ? ' ' + e.hora : ''}${e.repite ? ' (cada semana)' : ''}`),
        ...r.tareas.map(t => `☑️ ${t.titulo}${t.fecha ? ' — vence ' + t.fecha.slice(8, 10) + '/' + t.fecha.slice(5, 7) : ''}`),
        ...r.movimientos.map(m => `${m.tipo === 'ingreso' ? '💰 +' : '💸 −'} $${m.monto.toLocaleString('es-AR')} ${m.desc}`),
        ...r.cuentas.map(c => `🤝 ${c.tipo === 'cobrar' ? 'Te debe' : 'Le debés a'} ${c.nombre}${c.monto ? ' $' + c.monto.toLocaleString('es-AR') : ''}`),
        ...r.compras.map(c => `🛒 ${c.nombre}`),
      ];
      await enviarWA(`✅ Guardado: ${partes.join(', ')}\n\n${lineas.join('\n')}${r.eventos.some(e => e.hora) ? '\n\nTe aviso antes de cada evento con hora.' : ''}`);
    } catch (e) {
      console.error(e);
      await enviarWA('⚠️ No pude procesarlo: ' + String((e as Error)?.message || e).slice(0, 200)).catch(() => {});
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Verificación del webhook (se hace una sola vez desde el panel de Meta)
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env('WA_VERIFY_TOKEN')) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('ok');
  const cuerpo = await req.text();
  if (!(await firmaValida(req, cuerpo))) return new Response('firma inválida', { status: 401 });
  let body: Any;
  try { body = JSON.parse(cuerpo); } catch { return new Response('ok'); }
  const mensajes = (body?.entry || []).flatMap((e: Any) => (e.changes || []).flatMap((c: Any) => c.value?.messages || []));
  if (!mensajes.length) return new Response('ok');   // estados de entrega, etc.
  const trabajo = procesar(mensajes).catch(e => console.error(e));
  // Respondemos a Meta enseguida y seguimos procesando en segundo plano
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(trabajo); else await trabajo;
  return new Response('ok');
});
