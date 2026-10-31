// Función "recordatorios": la llama el cron cada 15 minutos (supabase/cron.sql).
// - Resumen del día por WhatsApp a la HORA_RESUMEN (por defecto 08:00).
// - Aviso AVISO_MINUTOS antes (por defecto 60) de cada evento con hora.
import { admin, agendaEntre, ahoraAR, enviarWA, env, guardarDoc, hm, leerDocs, resumenDia, sumarDias } from '../_shared/bnz.ts';

Deno.serve(async (req) => {
  const secreto = env('CRON_SECRET');
  if (!secreto || req.headers.get('x-cron-secret') !== secreto) return new Response('no autorizado', { status: 401 });
  const sb = admin(), userId = env('BNZ_USER_ID');
  const docs = await leerDocs(sb, userId, ['tareas', 'eventos', 'avisos']);
  const ah = ahoraAR(), hoy = ah.iso;
  const enviados: Record<string, string> = { ...(docs.avisos?.enviados || {}) };
  const log: string[] = [];

  // 1) Resumen del día
  const claveResumen = 'resumen|' + hoy;
  if (ah.minutos >= hm(env('HORA_RESUMEN', '08:00')) && !enviados[claveResumen]) {
    try { await enviarWA(resumenDia(docs)); enviados[claveResumen] = hoy; log.push('resumen'); } catch (e) { console.error(e); }
  }

  // 2) Eventos con hora que empiezan dentro de los próximos AVISO_MINUTOS
  const anticipo = Number(env('AVISO_MINUTOS', '60'));
  const proximos = agendaEntre(docs.eventos?.items || [], [], hoy, sumarDias(hoy, 1), hoy).filter(x => x.ev?.hora);
  for (const x of proximos) {
    const inicio = (x.fecha === hoy ? 0 : 1440) + hm(x.ev.hora);
    const faltan = inicio - ah.minutos;
    const clave = `${x.ev.id}|${x.fecha}|${x.ev.hora}`;
    if (faltan > 0 && faltan <= anticipo && !enviados[clave]) {
      try {
        await enviarWA(`⏰ En ${faltan} min: *${x.ev.titulo}* (${x.ev.hora} h)${x.ev.nota ? '\n📝 ' + x.ev.nota : ''}`);
        enviados[clave] = x.fecha; log.push(clave);
      } catch (e) { console.error(e); }
    }
  }

  // Limpia avisos de hace más de una semana
  const limite = sumarDias(hoy, -7);
  for (const k of Object.keys(enviados)) if (enviados[k] < limite) delete enviados[k];
  if (log.length) await guardarDoc(sb, userId, 'avisos', { enviados });
  return new Response(JSON.stringify({ hora: ah.hora, enviados: log }), { headers: { 'Content-Type': 'application/json' } });
});
