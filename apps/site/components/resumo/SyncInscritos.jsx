'use client';
/* Botão "Sincronizar inscritos": lê a API pública do painel da ESCON direto do navegador (ela só responde de dentro da
   rede do TCE), casa os cartões com as turmas (mesmo parser do coletor), guarda neste aparelho (localStorage que o
   useInscritos lê) e envia para a API do tce-senhas (os outros aparelhos recebem). Mostra quantas turmas mudaram.
   A URL da API (com a chave ?k=) e a chave de envio NÃO ficam no código do site (que é público): são pedidas uma vez
   e guardadas só neste navegador (ou vêm por ?painel=<url codificada>). Se o navegador bloquear a leitura direta
   (CORS/rede), aparece um atalho: abrir a API e colar o JSON aqui. */
import { useRef, useState } from 'react';
import { TCE as T } from '@tce/core';
import { apiCards, panelInfoOf, fromPanelCards } from '@tce/core/inscritos';
import Icon from '@/components/Icon';
import { LS_DATA, loadLS, saveLS } from '@/lib/useInscritos';

const PANEL_HOST = 'https://servicos.tce.ap.gov.br/escon/admin/api/public/painel/';
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

/** URL da API do painel: ?painel= (gravada), depois a guardada; senão pede uma vez. */
function panelUrl(ask) {
  const q = T.params.get('painel'); if (q && /^https?:\/\//.test(q)) { ls.set(LS_PANEL, q); return q; }
  const saved = ls.get(LS_PANEL); if (saved) return saved;
  if (!ask) return '';
  const typed = (window.prompt(`Cole a URL da API do painel da ESCON (começa com ${PANEL_HOST} e termina com ?k=…). Fica guardada só neste navegador.`) || '').trim();
  if (/^https?:\/\//.test(typed)) { ls.set(LS_PANEL, typed); return typed; }
  return '';
}

export default function SyncInscritos({ onData }) {
  const [st, setSt] = useState({ busy: false, msg: '', kind: '', fallback: false });
  const paste = useRef(null);
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
    const api = SEND_API();
    if (api) {
      let token = ls.get(LS_TOKEN);
      if (!token) { token = (window.prompt('Chave de envio para os outros aparelhos (a INSCRITOS_TOKEN do tce-senhas). Deixe em branco para atualizar só neste aparelho.') || '').trim(); ls.set(LS_TOKEN, token); }
      if (token) {
        try {
          const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': token }, body: JSON.stringify({ json: obj, source: 'sync-pagina', painelInfo }), signal: AbortSignal.timeout(15000) });
          if (r.status === 401) { ls.set(LS_TOKEN, ''); sent = 'chave de envio recusada: atualizado só neste aparelho'; }
          else if (!r.ok) sent = `falha ao enviar (${r.status}): atualizado só neste aparelho`;
          else sent = 'enviado para os outros aparelhos';
        } catch { sent = 'sem conexão com o tce-senhas: atualizado só neste aparelho'; }
      } else sent = 'atualizado só neste aparelho';
    }
    const when = T.partsOf(new Date()).time;
    const what = d.changed ? `${d.changed} turma${d.changed === 1 ? '' : 's'} atualizada${d.changed === 1 ? '' : 's'} (${d.delta >= 0 ? '+' : ''}${d.delta} inscrito${Math.abs(d.delta) === 1 ? '' : 's'})` : 'nenhuma mudança';
    setSt({ busy: false, kind: 'ok', fallback: false, msg: `Sincronizado às ${when} · ${what} · ${d.total} inscritos em ${d.turmas} turmas${painelInfo ? ` · painel de ${painelInfo}` : ''}${sent ? ` · ${sent}` : ''}${unmatched.length ? ` · ${unmatched.length} cartão(ões) sem turma correspondente` : ''}` });
  };
  const sync = async () => {
    const url = panelUrl(true);
    if (!url) { setSt({ busy: false, kind: 'warn', fallback: false, msg: 'Sem a URL da API do painel não dá para sincronizar. Toque de novo e cole a URL com a chave.' }); return; }
    setSt({ busy: true, kind: '', fallback: false, msg: 'Lendo o painel da ESCON…' });
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error(`painel respondeu ${r.status}`);
      const text = await r.text(); let obj; try { obj = JSON.parse(text); } catch { throw new Error('a resposta do painel não é JSON'); }
      await apply(obj);
    } catch (e) {
      const blocked = e && (e.name === 'TypeError' || e.name === 'TimeoutError' || e.name === 'AbortError');
      setSt({ busy: false, kind: 'warn', fallback: true, msg: blocked ? 'Não consegui ler a API daqui (fora da rede do TCE, ou o navegador bloqueou a leitura direta). Abra a API no botão ao lado, copie tudo e cole abaixo.' : `Falha: ${e.message}` });
    }
  };
  const fromPaste = async () => {
    const txt = paste.current ? paste.current.value.trim() : ''; if (!txt) return;
    setSt((s) => ({ ...s, busy: true, msg: 'Lendo o que foi colado…' }));
    try { await apply(JSON.parse(txt)); if (paste.current) paste.current.value = ''; } catch (e) { setSt({ busy: false, kind: 'warn', fallback: true, msg: `Não deu: ${e.message || 'JSON inválido'}` }); }
  };
  const forget = () => { ls.set(LS_PANEL, ''); ls.set(LS_TOKEN, ''); setSt({ busy: false, kind: '', fallback: false, msg: 'URL e chave esquecidas neste navegador.' }); };
  const url = panelUrl(false);
  return (
    <div className="sync-box">
      <div className="sync-row">
        <button type="button" className="sync-btn" onClick={sync} disabled={st.busy}><Icon name="sparkles" />{st.busy ? 'Sincronizando…' : 'Sincronizar inscritos'}</button>
        {st.fallback && url ? <a className="sync-open" href={url} target="_blank" rel="noreferrer"><Icon name="external" />Abrir a API do painel</a> : null}
        {st.msg ? <span className={`sync-msg ${st.kind}`}>{st.kind === 'ok' ? <Icon name="check" /> : st.kind === 'warn' ? <Icon name="alert" /> : null}{st.msg}</span> : null}
        {url ? <button type="button" className="sync-forget" onClick={forget} title="Esquecer a URL da API e a chave guardadas neste navegador">esquecer chave</button> : null}
      </div>
      {st.fallback ? <div className="sync-paste"><textarea ref={paste} rows={3} placeholder="Cole aqui o conteúdo (JSON) que a API do painel mostrou" /><button type="button" className="sync-btn" onClick={fromPaste} disabled={st.busy}><Icon name="check" />Usar o que colei</button></div> : null}
    </div>
  );
}
