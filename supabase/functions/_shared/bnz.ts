// Código compartido por las funciones de Supabase (ia, whatsapp, recordatorios).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

// deno-lint-ignore no-explicit-any
type Any = any;

export const env = (k: string, def = ''): string => Deno.env.get(k) ?? def;
export const admin = (): SupabaseClient => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
export const soloDigitos = (s: string) => String(s || '').replace(/\D/g, '');

export const AREAS_DEF = [
  { id: 'muni', nombre: 'Municipalidad', det: 'Dir. de Proyecto y Arquitectura Urbana' },
  { id: 'prof', nombre: 'Profesorado', det: 'Prof. en Educación Secundaria en Informática' },
  { id: 'acuna', nombre: 'Arq. Julieta Acuña', det: 'Particular' },
  { id: 'yanuzzi', nombre: 'Arq. Martín Yanuzzi', det: 'Particular' },
  { id: 'monica', nombre: 'Arq. Mónica', det: 'Particular' },
  { id: 'segovia', nombre: 'M.M.O. Malvina Segovia', det: 'Particular' },
  { id: 'info', nombre: 'Informática', det: 'Mantenimientos particulares' },
  { id: 'otros', nombre: 'Personal y cursos', det: '' },
];
export const CATS = ['Trabajo', 'Beca', 'Comida', 'Transporte', 'Servicios', 'Insumos', 'Deporte', 'Compras', 'Salud', 'Deudas', 'Otros'];

/* ---------- Fechas (Argentina, UTC-3 sin horario de verano) ---------- */
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function ahoraAR() {
  const d = new Date(Date.now() - 3 * 3600e3);
  return { iso: d.toISOString().slice(0, 10), hora: d.toISOString().slice(11, 16), minutos: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
export const sumarDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const fDia = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; };
export const isoValido = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const hm = (s: string) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

/* ---------- Claude (API de Anthropic) ---------- */
export async function claude(messages: Any[], maxTokens = 4000): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('ANTHROPIC_MODEL', 'claude-sonnet-5-5'), max_tokens: maxTokens, messages }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `Anthropic HTTP ${r.status}`);
  return (d.content || []).filter((c: Any) => c.type === 'text').map((c: Any) => c.text).join('');
}
export function parsearJSON(text: string): Any {
  const intentos = [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1]];
  const a = text.search(/[\[{]/), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (a >= 0 && b > a) intentos.push(text.slice(a, b + 1));
  for (const t of intentos) { if (!t) continue; try { return JSON.parse(t); } catch { /* sigue */ } }
  throw new Error('La IA respondió algo que no se pudo leer.');
}

/* ---------- Documentos ---------- */
export async function leerDocs(sb: SupabaseClient, userId: string, docs: string[]): Promise<Record<string, Any>> {
  const { data, error } = await sb.from('bnz_docs').select('doc, datos').eq('user_id', userId).in('doc', docs);
  if (error) throw error;
  const out: Record<string, Any> = {};
  (data || []).forEach((r: Any) => { out[r.doc] = r.datos; });
  return out;
}
export async function guardarDoc(sb: SupabaseClient, userId: string, doc: string, datos: Any) {
  const { error } = await sb.from('bnz_docs').upsert({ user_id: userId, doc, datos, actualizado: new Date().toISOString() });
  if (error) throw error;
}

/* ---------- Ordenar información (mismo criterio que la página) ---------- */
export function promptOrdenar(texto: string, areas: Any[], nombre: string, conImagen: boolean) {
  const hoy = ahoraAR().iso;
  return `Sos el asistente de organización personal de ${nombre || 'Benjamín Nuñez'} (marca Design | BNZ, Gdor. Virasoro, Corrientes, Argentina). Hoy es ${fDia(hoy)} de ${hoy.slice(0, 4)} (${hoy}). Hablás español rioplatense.
Te paso información desordenada${conImagen ? ' (texto y/o una captura de pantalla)' : ' (un mensaje de WhatsApp o notas sueltas)'}. Extraé y ordená TODO lo accionable.

Áreas válidas (usá el id exacto): ${areas.map((a: Any) => `${a.id} = ${a.nombre}${a.det ? ' (' + a.det + ')' : ''}`).join('; ')}. Si no encaja, usá "otros".
Categorías de movimientos: ${CATS.join(', ')}.

Reglas:
- Convertí fechas relativas ("mañana", "el viernes", "el 5", "la semana que viene") a YYYY-MM-DD contando desde hoy. Si no hay fecha, "".
- Citas, reuniones, clases, exámenes, entregas o turnos con día concreto → "eventos" (hora "HH:MM" en 24 h o ""). Si además hay algo para preparar antes, agregalo como tarea.
- Algo que se repite cada semana → evento con "repite":"semanal" y la fecha de la próxima vez.
- Tareas: plazo "hoy" si es para hoy o mañana, "corto" si es dentro de unas 4 semanas, "largo" si es más o no tiene apuro. prioridad "alta" si es urgente o importante, si no "media" o "baja".
- Plata que ya se gastó o cobró → "movimientos" (monto como número en pesos sin signo: "90 mil" = 90000, "5 lucas" = 5000, "1,5 palos" = 1500000). tipo "ingreso" o "gasto". Fecha de hoy si no se dice otra.
- Deudas ("le debo a X", "X me debe") → "cuentas" con tipo "pagar" o "cobrar".
- Cosas para comprar todavía → "compras".
- No inventes datos. Lo que no sea accionable pero valga la pena recordar va en "notas" (frases cortas).
- "resumen": una oración corta de lo que encontraste.

Respondé SOLO con JSON con esta forma exacta:
{"resumen":"","tareas":[{"titulo":"","area":"otros","plazo":"corto","fecha":"","prioridad":"media","nota":""}],"eventos":[{"titulo":"","fecha":"YYYY-MM-DD","hora":"","area":"otros","repite":"","nota":""}],"movimientos":[{"fecha":"YYYY-MM-DD","desc":"","tipo":"gasto","cat":"Otros","monto":0}],"cuentas":[{"nombre":"","tipo":"cobrar","monto":0}],"compras":[{"nombre":"","monto":0}],"notas":[""]}
Usá listas vacías cuando no haya nada.

Información:
"""
${texto || '(ver captura adjunta)'}
"""`;
}
export function limpiar(r: Any, areas: Any[]) {
  const okArea = (a: string) => areas.some((x: Any) => x.id === a) ? a : 'otros';
  const arr = (v: Any) => Array.isArray(v) ? v : [];
  const str = (v: Any) => typeof v === 'string' ? v.trim() : '';
  const hoy = ahoraAR().iso;
  return {
    resumen: str(r?.resumen),
    tareas: arr(r?.tareas).filter((t: Any) => str(t.titulo)).map((t: Any) => ({ titulo: str(t.titulo), area: okArea(t.area), plazo: ['hoy', 'corto', 'largo'].includes(t.plazo) ? t.plazo : 'corto', fecha: isoValido(t.fecha) ? t.fecha : '', prioridad: ['alta', 'media', 'baja'].includes(t.prioridad) ? t.prioridad : 'media', nota: str(t.nota) })),
    eventos: arr(r?.eventos).filter((e: Any) => str(e.titulo) && isoValido(e.fecha)).map((e: Any) => ({ titulo: str(e.titulo), fecha: e.fecha, hora: /^\d{2}:\d{2}$/.test(e.hora || '') ? e.hora : '', area: okArea(e.area), repite: e.repite === 'semanal' ? 'semanal' : '', nota: str(e.nota) })),
    movimientos: arr(r?.movimientos).filter((m: Any) => str(m.desc) && Number(m.monto) > 0).map((m: Any) => ({ fecha: isoValido(m.fecha) ? m.fecha : hoy, desc: str(m.desc), tipo: m.tipo === 'ingreso' ? 'ingreso' : 'gasto', cat: CATS.includes(m.cat) ? m.cat : 'Otros', monto: Number(m.monto) })),
    cuentas: arr(r?.cuentas).filter((c: Any) => str(c.nombre)).map((c: Any) => ({ nombre: str(c.nombre), tipo: c.tipo === 'pagar' ? 'pagar' : 'cobrar', monto: Number(c.monto) || 0 })),
    compras: arr(r?.compras).filter((c: Any) => str(c.nombre)).map((c: Any) => ({ nombre: str(c.nombre), monto: Number(c.monto) || 0 })),
    notas: arr(r?.notas).map(str).filter(Boolean),
  };
}
/** Guarda lo ordenado en los documentos del usuario y devuelve un texto con lo que se agregó. */
export async function aplicar(sb: SupabaseClient, userId: string, r: ReturnType<typeof limpiar>, textoOriginal: string) {
  const d = await leerDocs(sb, userId, ['tareas', 'eventos', 'eco', 'ia']);
  const hoy = ahoraAR().iso;
  const tareas = { items: [], ...(d.tareas || {}) }, eventos = { items: [], ...(d.eventos || {}) };
  const eco = { ingresos: [], gastos: [], servicios: [], metas: [], compras: [], movimientos: [], ahorro: {}, ...(d.eco || {}) };
  const ia = { historial: [], chat: [], ...(d.ia || {}) };
  r.tareas.forEach(t => tareas.items.push({ id: uid(), ...t, diaria: false, hecha: false, hechaEn: '', creada: hoy } as never));
  r.eventos.forEach(e => eventos.items.push({ id: uid(), ...e } as never));
  r.movimientos.forEach(m => eco.movimientos.push({ id: uid(), ...m } as never));
  r.cuentas.forEach(c => eco.metas.push({ id: uid(), nombre: c.nombre, tipo: c.tipo, monto: c.monto, hecha: false } as never));
  r.compras.forEach(c => eco.compras.push({ id: uid(), nombre: c.nombre, monto: c.monto, hecha: false } as never));
  const partes: string[] = [];
  if (r.tareas.length) { partes.push(`${r.tareas.length} tareas`); await guardarDoc(sb, userId, 'tareas', tareas); }
  if (r.eventos.length) { partes.push(`${r.eventos.length} eventos`); await guardarDoc(sb, userId, 'eventos', eventos); }
  if (r.movimientos.length) partes.push(`${r.movimientos.length} movimientos`);
  if (r.cuentas.length) partes.push(`${r.cuentas.length} cuentas`);
  if (r.compras.length) partes.push(`${r.compras.length} compras`);
  if (r.movimientos.length || r.cuentas.length || r.compras.length) await guardarDoc(sb, userId, 'eco', eco);
  if (partes.length) {
    const ahora = ahoraAR();
    ia.historial.push({ fecha: hoy, hora: ahora.hora, texto: ('[WhatsApp] ' + textoOriginal).slice(0, 400), resumen: r.resumen, conteo: partes.join(' · ') } as never);
    ia.historial = ia.historial.slice(-30);
    await guardarDoc(sb, userId, 'ia', ia);
  }
  return partes;
}

/* ---------- Agenda y resumen del día ---------- */
const tareaHecha = (t: Any, hoy: string) => t.diaria ? t.hechaEn === hoy : !!t.hecha;
export function agendaEntre(eventos: Any[], tareas: Any[], desde: string, hasta: string, hoy: string) {
  const out: Any[] = [];
  (eventos || []).forEach(ev => {
    if (!isoValido(ev.fecha)) return;
    if (ev.repite === 'semanal') {
      let f = ev.fecha;
      if (f < desde) { const dif = Math.round((Date.parse(desde) - Date.parse(f)) / 864e5); f = sumarDias(f, Math.ceil(dif / 7) * 7); }
      for (; f <= hasta; f = sumarDias(f, 7)) out.push({ tipo: 'ev', fecha: f, ev });
    } else if (ev.fecha >= desde && ev.fecha <= hasta) out.push({ tipo: 'ev', fecha: ev.fecha, ev });
  });
  (tareas || []).forEach(t => { if (isoValido(t.fecha) && !tareaHecha(t, hoy) && t.fecha >= desde && t.fecha <= hasta) out.push({ tipo: 'tarea', fecha: t.fecha, t }); });
  return out.sort((a, b) => (a.fecha + (a.ev?.hora || '99')).localeCompare(b.fecha + (b.ev?.hora || '99')));
}
export function resumenDia(docs: Record<string, Any>) {
  const hoy = ahoraAR().iso;
  const tareas: Any[] = docs.tareas?.items || [], eventos: Any[] = docs.eventos?.items || [];
  const ag = agendaEntre(eventos, tareas, hoy, sumarDias(hoy, 1), hoy);
  const PRIO: Record<string, number> = { alta: 0, media: 1, baja: 2 };
  const foco = tareas.filter(t => !tareaHecha(t, hoy) && (t.plazo === 'hoy' || t.diaria || t.fecha === hoy || (t.fecha && t.fecha < hoy) || t.prioridad === 'alta'))
    .sort((a, b) => (PRIO[a.prioridad] ?? 1) - (PRIO[b.prioridad] ?? 1)).slice(0, 8);
  let m = `📋 *Design | BNZ · ${fDia(hoy)}*\n`;
  if (ag.length) m += `\n*Agenda*\n` + ag.map(x => `• ${x.fecha === hoy ? 'Hoy' : 'Mañana'}${x.ev?.hora ? ' ' + x.ev.hora : ''}: ${x.ev ? x.ev.titulo : 'vence ' + x.t.titulo}`).join('\n') + '\n';
  if (foco.length) m += `\n*Tareas en foco*\n` + foco.map(t => `• ${t.titulo}${t.fecha && t.fecha < hoy ? ' (vencida)' : ''}`).join('\n') + '\n';
  if (!ag.length && !foco.length) m += '\nNada urgente por hoy. 🙌';
  return m;
}

/* ---------- WhatsApp (Cloud API de Meta) ---------- */
export async function enviarWA(texto: string, to = env('WA_MI_NUMERO')) {
  const url = `https://graph.facebook.com/${env('WA_GRAPH_VERSION', 'v21.0')}/${env('WA_PHONE_ID')}/messages`;
  const headers = { Authorization: `Bearer ${env('WA_TOKEN')}`, 'Content-Type': 'application/json' };
  const destino = soloDigitos(to);
  let r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: texto.slice(0, 4000) } }) });
  let d = await r.json().catch(() => ({}));
  // Fuera de la ventana de 24 h Meta solo deja mandar plantillas aprobadas
  if (!r.ok && d?.error?.code === 131047 && env('WA_PLANTILLA')) {
    const param = texto.replace(/[\n\t]+/g, ' · ').replace(/ {4,}/g, '   ').slice(0, 1000);
    r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'template', template: { name: env('WA_PLANTILLA'), language: { code: env('WA_PLANTILLA_IDIOMA', 'es_AR') }, components: [{ type: 'body', parameters: [{ type: 'text', text: param }] }] } }) });
    d = await r.json().catch(() => ({}));
  }
  if (!r.ok) throw new Error(d?.error?.message || `WhatsApp HTTP ${r.status}`);
  return d;
}
