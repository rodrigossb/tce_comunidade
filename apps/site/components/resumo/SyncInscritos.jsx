'use client';
/* Botão "Sincronizar inscritos": lê a API pública do painel da ESCON direto do navegador (ela só responde de dentro da
   rede do TCE), casa os cartões com as turmas (mesmo parser do coletor), guarda neste aparelho (localStorage que o
   useInscritos lê) e envia para a API do tce-senhas (os outros aparelhos recebem). Mostra quantas turmas mudaram.
   A chave da API (?k=) e a chave de envio NÃO ficam no código do site (que é público): são pedidas uma vez num
   formulário na própria página e guardadas só neste navegador (ou vêm por ?painel=<url ou chave>). Aceita a chave
   sozinha, "k=…" ou a URL completa. Se o navegador bloquear a leitura direta (CORS/rede), aparece um atalho: abrir
   a API e colar o JSON aqui. */
import { useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { apiCards, panelInfoOf, fromPanelCards } from '@tce/core/inscritos';
import Icon from '@/components/Icon';
import { LS_DATA, loadLS, saveLS } from '@/lib/useInscritos';

const PANEL_HOST = 'https://servicos.tce.ap.gov.br/escon/admin/api/public/painel/';
const PANEL_EVENT = 'oiapoque'; // painel desta edição (a chave vem do usuário, não do código)
const LS_PANEL = 'tce_painel_api'; // URL completa da API do painel (com ?k=), guardada só neste navegador
const LS_TOKEN = 'tce_inscritos_chave'; // chave de envio (INSCRITOS_TOKEN) para o tce-senhas
const SEND_API = () => { const a = (T.params.get('api') || T.D.event.apiUrl || '').replace(/\/$/, ''); return a ? `${a}/api/inscritos` : ''; };
const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* sem storage */ } } };

/** Compara o retrato novo com o atual: turmas com número diferente e variação de inscritos. */
export function diffInscritos(oldById, newById) {
  const o = oldById || {}; let changed = 0; let delta = 0; let total = 0; let turmas = 0;
  for (const [k, v] of Object.entries(newById || {})) { const n = Number(v.inscritos) || 0; total += n; turmas++; const prev = o[k] ? Number(o[k].inscritos) || 0 : null; if (prev !== n) { changed++; delta += n - (prev || 0); } }
  return { changed, delta, total, turmas };
}

/** Normaliza o que a pessoa colou: URL completa, "?k=chave", "k=chave" ou só a chave → URL da API; '' se não serve. */
export function panelUrlFrom(text) {
  const t = String(text || '').trim().replace(/^["'<]+|[>"']+$/g, '');
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  const m = t.match(/^\??k=(.+)$/i); const key = (m ? m[1] : t).trim();
  if (!/^[A-Za-z0-9_\-.~%]{6,}$/.test(key)) return '';
  return `${PANEL_HOST}${PANEL_EVENT}?k=${key}`;
}

/** URL guardada da API do painel (?painel= grava; senão a do localStorage). */
function savedPanelUrl() {
  const q = panelUrlFrom(T.params.get('painel')); if (q) { ls.set(LS_PANEL, q); return q; }
  return ls.get(LS_PANEL);
}

export default function SyncInscritos({ onData }) {
  const [st, setSt] = useState({ busy: false, msg: '', kind: '', fallback: false });
  const [setup, setSetup] = useState(false); // formulário com as chaves aberto
  const [url, setUrl] = useState(() => (typeof window === 'undefined' ? '' : savedPanelUrl()));
  const paste = useRef(null); const keyIn = useRef(null); const tokIn = useRef(null);
  const apply = async (obj) => {
    const cards = apiCards(obj); if (!cards.length) throw new Error('a resposta não tem a lista de turmas que eu esperava');
    const { byKey, unmatched } = fromPanelCards(cards);
    if (!Object.keys(byKey).length) throw new Error('nenhuma turma reconhecida na resposta');
    const cur = loadLS(LS_DATA, null); const d = diffInscritos(cur && cur.byId, byKey);
    const painelInfo = panelInfoOf(obj) || '';
    const data = { byId: byKey, updatedAt: Date.now(), source: 'sincronizado', painelInfo };
    saveLS(LS_DATA, data); if (onData) onData(data);
    // envia para o tce-senhas (os outros aparelhos e as outras páginas leem de lá); a chave fica só neste navegador
    let sent = '';
    const api = SEND_API(); const token = ls.get(LS_TOKEN);
    if (api && token) {
      try {
        const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': token }, body: JSON.stringify({ json: obj, source: 'sync-pagina', painelInfo }), signal: AbortSignal.timeout(15000) });
        if (r.status === 401) { ls.set(LS_TOKEN, ''); sent = 'chave de envio recusada: atualizado só neste aparelho'; }
        else if (!r.ok) sent = `falha ao enviar (${r.status}): atualizado só neste aparelho`;
        else sent = 'enviado para os outros aparelhos';
      } catch { sent = 'sem conexão com o tce-senhas: atualizado só neste aparelho'; }
    } else if (api) sent = 'atualizado só neste aparelho (sem chave de envio)';
    const when = T.partsOf(new Date()).time;
    const what = d.changed ? `${d.changed} turma${d.changed === 1 ? '' : 's'} atualizada${d.changed === 1 ? '' : 's'} (${d.delta >= 0 ? '+' : ''}${d.delta} inscrito${Math.abs(d.delta) === 1 ? '' : 's'})` : 'nenhuma mudança';
    setSt({ busy: false, kind: 'ok', fallback: false, msg: `Sincronizado às ${when} · ${what} · ${d.total} inscritos em ${d.turmas} turmas${painelInfo ? ` · painel de ${painelInfo}` : ''}${sent ? ` · ${sent}` : ''}${unmatched.length ? ` · ${unmatched.length} cartão(ões) sem turma correspondente` : ''}` });
  };
  const sync = async (u) => {
    const target = u || url;
    if (!target) { setSetup(true); setSt({ busy: false, kind: 'warn', fallback: false, msg: 'Informe a chave da API do painel abaixo (uma vez só neste navegador).' }); return; }
    setSt({ busy: true, kind: '', fallback: false, msg: 'Lendo o painel da ESCON…' });
    try {
      const r = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
      if (r.status === 401 || r.status === 403) throw new Error(`o painel recusou a chave (${r.status}); confira em "chaves"`);
      if (!r.ok) throw new Error(`painel respondeu ${r.status}`);
      const text = await r.text(); let obj; try { obj = JSON.parse(text); } catch { throw new Error('a resposta do painel não é JSON'); }
      await apply(obj);
    } catch (e) {
      const blocked = e && (e.name === 'TypeError' || e.name === 'TimeoutError' || e.name === 'AbortError');
      setSt({ busy: false, kind: 'warn', fallback: true, msg: blocked ? 'Não consegui ler a API daqui (fora da rede do TCE, ou o navegador bloqueou a leitura direta). Abra a API no botão ao lado, copie tudo e cole abaixo.' : `Falha: ${e.message}` });
    }
  };
  const saveKeys = () => {
    const u = panelUrlFrom(keyIn.current ? keyIn.current.value : '');
    const tok = (tokIn.current ? tokIn.current.value : '').trim();
    if (!u) { setSt({ busy: false, kind: 'warn', fallback: false, msg: 'Chave do painel inválida: cole a chave (o que vem depois de k=) ou a URL completa da API.' }); return; }
    ls.set(LS_PANEL, u); if (tok) ls.set(LS_TOKEN, tok);
    setUrl(u); setSetup(false); if (keyIn.current) keyIn.current.value = ''; if (tokIn.current) tokIn.current.value = '';
    sync(u);
  };
  const fromPaste = async () => {
    const txt = paste.current ? paste.current.value.trim() : ''; if (!txt) return;
    setSt((s) => ({ ...s, busy: true, msg: 'Lendo o que foi colado…' }));
    try { await apply(JSON.parse(txt)); if (paste.current) paste.current.value = ''; } catch (e) { setSt({ busy: false, kind: 'warn', fallback: true, msg: `Não deu: ${e.message || 'JSON inválido'}` }); }
  };
  const forget = () => { ls.set(LS_PANEL, ''); ls.set(LS_TOKEN, ''); setUrl(''); setSetup(true); setSt({ busy: false, kind: '', fallback: false, msg: 'Chaves esquecidas neste navegador.' }); };
  const hasTok = !!ls.get(LS_TOKEN);
  return (
    <div className="sync-box">
      <div className="sync-row">
        <button type="button" className="sync-btn" onClick={() => sync()} disabled={st.busy}><Icon name="sparkles" />{st.busy ? 'Sincronizando…' : 'Sincronizar inscritos'}</button>
        {st.fallback && url ? <a className="sync-open" href={url} target="_blank" rel="noreferrer"><Icon name="external" />Abrir a API do painel</a> : null}
        {st.msg ? <span className={`sync-msg ${st.kind}`}>{st.kind === 'ok' ? <Icon name="check" /> : st.kind === 'warn' ? <Icon name="alert" /> : null}{st.msg}</span> : null}
        <button type="button" className="sync-forget" onClick={() => setSetup((v) => !v)} title="Informar ou trocar a chave da API do painel e a chave de envio">{url ? 'chaves' : 'informar chave'}</button>
      </div>
      {setup ? (
        <form className="sync-setup" onSubmit={(e) => { e.preventDefault(); saveKeys(); }}>
          <label>Chave da API do painel da ESCON <small>(o que vem depois de <code>k=</code>, ou a URL completa){url ? ' · já guardada; preencha só para trocar' : ''}</small>
            <input ref={keyIn} type="text" inputMode="text" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder={url ? '•••••••• (guardada)' : 'cole aqui a chave'} defaultValue="" />
          </label>
          <label>Chave de envio para os outros aparelhos <small>(a INSCRITOS_TOKEN do tce-senhas; opcional{hasTok ? ' · já guardada' : ''})</small>
            <input ref={tokIn} type="password" autoComplete="off" placeholder={hasTok ? '•••••••• (guardada)' : 'opcional'} defaultValue="" />
          </label>
          <div className="sync-setup-act">
            <button type="submit" className="sync-btn" disabled={st.busy}><Icon name="check" />Guardar e sincronizar</button>
            {url ? <button type="button" className="sync-forget" onClick={forget}>esquecer chaves</button> : null}
            <small>As chaves ficam só neste navegador; não vão para o site.</small>
          </div>
        </form>
      ) : null}
      {st.fallback ? <div className="sync-paste"><textarea ref={paste} rows={3} placeholder="Cole aqui o conteúdo (JSON) que a API do painel mostrou" /><button type="button" className="sync-btn" onClick={fromPaste} disabled={st.busy}><Icon name="check" />Usar o que colei</button></div> : null}
    </div>
  );
}
