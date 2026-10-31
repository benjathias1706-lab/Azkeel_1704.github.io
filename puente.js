/* =====================================================================
   Puente entre la app y Supabase.
   La app usa una interfaz simple de documentos (db.doc(...).set / onSnapshot)
   y una IA (sample). Este archivo implementa esa interfaz con Supabase:
   - tabla bnz_docs     → un documento por sección (tareas, eco, eventos…)
   - tabla bnz_respaldos → una copia completa por día
   - función "ia"       → la IA (tu clave de Anthropic queda en Supabase)
   Si config.js no tiene las claves, este archivo no hace nada y la app
   guarda solo en el navegador.
   ===================================================================== */
(function(){
  'use strict';
  const C = window.BNZ_CONFIG || {};
  if(!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) return;

  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  let sb = null, uid = null, resolverListo, cargado = false;
  const listo = new Promise(r => { resolverListo = r; });
  const subs = {};        // doc -> [callbacks]
  const cache = {};       // doc -> datos
  const escrito = {};     // doc -> JSON canónico de lo último que escribimos

  const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
  const snap = (id, obj) => ({ id, exists: obj != null, data: () => obj == null ? undefined : JSON.parse(JSON.stringify(obj)), metadata: { fromCache: false, hasPendingWrites: false } });
  const error = e => { const m = (e && (e.message || e.error_description)) || 'Error'; const red = /fetch|network|Failed|timeout/i.test(m); return { code: red ? 'unavailable' : /too large|payload/i.test(m) ? 'invalid_argument' : 'unavailable', message: m }; };
  const partes = path => { const p = path.split('/'); return { doc: p[3], sub: p[4], subId: p[5] }; };

  function entregar(doc){ (subs[doc] || []).forEach(fn => { try { fn(snap(doc, cache[doc] ?? null)); } catch(e){ console.error(e); } }); }
  async function cargarTodo(){
    const { data, error: e } = await sb.from('bnz_docs').select('doc, datos').eq('user_id', uid);
    if(e) throw error(e);
    (data || []).forEach(r => { cache[r.doc] = r.datos; });
    cargado = true;
    Object.keys(subs).forEach(entregar);
  }
  async function recargarDoc(doc){
    const { data } = await sb.from('bnz_docs').select('datos').eq('user_id', uid).eq('doc', doc).maybeSingle();
    const nuevo = data ? data.datos : null;
    if(escrito[doc] && canon(nuevo) === escrito[doc]) return;   // es el eco de nuestra propia escritura
    cache[doc] = nuevo; entregar(doc);
  }

  const respaldoRef = (path, fecha) => ({
    id: fecha, path,
    async get(){ const { data, error: e } = await sb.from('bnz_respaldos').select('datos').eq('user_id', uid).eq('fecha', fecha).maybeSingle(); if(e) throw error(e); return snap(fecha, data ? data.datos : null); },
    async set(d){ const { error: e } = await sb.from('bnz_respaldos').upsert({ user_id: uid, fecha, datos: d }); if(e) throw error(e); },
    async delete(){ await sb.from('bnz_respaldos').delete().eq('user_id', uid).eq('fecha', fecha); }
  });
  const coleccion = path => ({
    path,
    doc: id => respaldoRef(path + '/' + id, id),
    async get(){
      const { data, error: e } = await sb.from('bnz_respaldos').select('fecha, datos').eq('user_id', uid).order('fecha');
      if(e) throw error(e);
      const docs = (data || []).map(r => snap(r.fecha, r.datos));
      return { docs, size: docs.length, empty: !docs.length };
    }
  });
  const docRef = path => {
    const { doc, sub, subId } = partes(path);
    if(sub === 'respaldos') return respaldoRef(path, subId);
    return {
      id: doc, path,
      async get(){ if(!cargado) await cargarTodo(); return snap(doc, cache[doc] ?? null); },
      async set(d){
        escrito[doc] = canon(d);
        const { error: e } = await sb.from('bnz_docs').upsert({ user_id: uid, doc, datos: d, actualizado: new Date().toISOString() });
        if(e) throw error(e);
        cache[doc] = JSON.parse(JSON.stringify(d));
      },
      async delete(){ await sb.from('bnz_docs').delete().eq('user_id', uid).eq('doc', doc); },
      onSnapshot(next, onErr){
        (subs[doc] = subs[doc] || []).push(next);
        if(cargado) setTimeout(() => next(snap(doc, cache[doc] ?? null)), 0);
        return () => { subs[doc] = (subs[doc] || []).filter(f => f !== next); };
      },
      collection: name => coleccion(path + '/' + name)
    };
  };
  const db = { doc: docRef, collection: coleccion };
  const user = { id: async () => uid, isOwner: async () => true, canEdit: async () => true, can: async () => true };

  /* ---------- IA a través de la función "ia" de Supabase ---------- */
  async function aBase64(blob){
    try {
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      return { media_type: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.85).split(',')[1] };
    } catch(e){
      const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
      for(let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { media_type: blob.type || 'image/png', data: btoa(s) };
    }
  }
  async function llamarIA(messages, images){
    const { data, error: e } = await sb.functions.invoke('ia', { body: { messages, images } });
    if(e){
      let msg = e.message, status = 0;
      try { status = e.context && e.context.status; const b = await e.context.json(); msg = b.error || msg; } catch(x){}
      throw { code: status === 429 ? 'rate_limited' : status === 401 ? 'not_granted' : 'upstream_error', message: msg };
    }
    if(!data || typeof data.text !== 'string') throw { code: 'empty_completion', message: 'La IA no respondió.' };
    return data.text;
  }
  const sample = async (input, opts = {}) => {
    const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
    const images = opts.images && opts.images.length ? await Promise.all(opts.images.map(aBase64)) : null;
    const text = await llamarIA(messages, images);
    if(opts.onText) try { opts.onText({ text, delta: text }); } catch(e){}
    return { text, truncated: false };
  };
  sample.json = async (input, opts = {}) => {
    const extra = '\n\nRespondé únicamente con el JSON, sin texto antes ni después.';
    const inp = typeof input === 'string' ? input + extra : input.map((m, i) => i === input.length - 1 ? { ...m, content: m.content + extra } : m);
    const { text } = await sample(inp, opts);
    const intentos = [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1], (() => { const a = text.search(/[\[{]/), b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']')); return a >= 0 && b > a ? text.slice(a, b + 1) : null; })()];
    for(const t of intentos){ if(!t) continue; try { return JSON.parse(t); } catch(e){} }
    throw { code: 'invalid_json', message: 'Respuesta no válida', text };
  };
  sample.limits = async () => ({ images: { maxCount: 4 } });

  /* ---------- Lo que ve la app ---------- */
  const caps = { db, user, sample: C.IA_ACTIVADA ? sample : null, downloads: null };
  window.claude = { use: async name => { await listo; return caps[name] ?? null; } };
  window.BNZ_SALIR = async () => { try { await sb.auth.signOut(); } catch(e){} location.reload(); };

  /* ---------- Acceso por email (sin contraseña) ---------- */
  function pantallaAcceso(msg){
    let el = document.getElementById('acceso');
    if(!el){ el = document.createElement('div'); el.id = 'acceso'; document.body.appendChild(el); }
    el.hidden = false;
    el.innerHTML = `
      <div class="rotulo">
        <div class="rotulo-marca"><div class="m1">Design<span>|</span>BNZ</div><div class="m2">Diseño · Visualización · Tecnología</div></div>
        <form id="f-acceso" novalidate>
          <h1>Entrar a tu gestión</h1>
          <p class="ayuda">Sin contraseña: te mando un link a tu email. Lo abrís en este mismo dispositivo y queda abierto.</p>
          <label class="lbl" for="acc-email">Email</label>
          <input class="inp" id="acc-email" type="email" autocomplete="email" required value="${C.EMAIL || ''}">
          <p class="msg" id="acc-msg" role="status">${msg || ''}</p>
          <button class="btn btn-primary" type="submit" id="acc-btn">Mandarme el link</button>
        </form>
      </div>`;
    document.getElementById('f-acceso').addEventListener('submit', async ev => {
      ev.preventDefault();
      const email = document.getElementById('acc-email').value.trim(), m = document.getElementById('acc-msg'), b = document.getElementById('acc-btn');
      if(!email){ m.textContent = 'Escribí tu email.'; m.className = 'msg err'; return; }
      if(C.EMAIL && email.toLowerCase() !== C.EMAIL.toLowerCase()){ m.textContent = 'Este sitio es privado: ese email no tiene acceso.'; m.className = 'msg err'; return; }
      b.disabled = true; b.textContent = 'Enviando…';
      const { error: e } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
      b.disabled = false; b.textContent = 'Mandarme el link';
      if(e){ m.textContent = /rate|seconds/i.test(e.message) ? 'Esperá un minuto antes de pedir otro link.' : 'No se pudo enviar: ' + e.message; m.className = 'msg err'; }
      else { m.textContent = 'Listo. Revisá tu email (y la carpeta de spam) y tocá el link.'; m.className = 'msg ok'; }
    });
  }
  async function entrar(session){
    if(uid) return;
    uid = session.user.id;
    const el = document.getElementById('acceso'); if(el) el.hidden = true;
    try { await cargarTodo(); } catch(e){ console.error(e); }
    sb.channel('bnz-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bnz_docs', filter: 'user_id=eq.' + uid }, p => {
        const doc = (p.new && p.new.doc) || (p.old && p.old.doc);
        if(doc) recargarDoc(doc); else cargarTodo().catch(() => {});
      })
      .subscribe();
    resolverListo();
  }
  function iniciar(){
    if(!window.supabase){ pantallaAcceso('No se pudo cargar la conexión. Revisá internet y recargá.'); return; }
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    sb.auth.onAuthStateChange((evento, session) => { if(session) entrar(session); });
    sb.auth.getSession().then(({ data }) => { if(data.session) entrar(data.session); else pantallaAcceso(/error_description=([^&]+)/.test(location.hash) ? 'El link venció o ya se usó. Pedí uno nuevo.' : ''); });
  }
  const s = document.createElement('script'); s.src = SUPABASE_JS; s.onload = iniciar; s.onerror = iniciar; document.head.appendChild(s);
})();
