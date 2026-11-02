'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { TCE as T } from '@tce/core';
import Icon from '@/components/Icon';
import Qr from '@/components/Qr';

const D = T.D;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const svcDay = (venue) => T.serviceDays().find((d) => d.venue === venue);
const servicesAt = (p) => D.services.filter((s) => (!p.svc || p.svc === s.id) && T.placesOf(s, p.venue).includes(p.id));
const itemsAt = (s, p) => s.items.filter((it) => T.itemWhere(it, p.venue).includes(p.id));
const roomSort = (a, b) => (Number(a.num) || 999) - (Number(b.num) || 999) || String(a.num).localeCompare(String(b.num));
const KIND = { sala: 'Sala', tenda: 'Tenda', area: 'Ambiente' };
const when = (x) => `${cap(T.fmtDate(x.date, 'wdlong'))} · ${T.fmtTime(x.time)}–${T.fmtTime(T.sessionEnd(x))}`;
// Palavras com hífen ("Bem-estar") não quebram no hífen: cada uma vai num span nowrap.
const nb = (t) => String(t || '').split(' ').map((w, i) => [i ? ' ' : '', w.includes('-') ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{w}</span> : w]);
const range = (x) => `${T.fmtTime(x.time)}–${T.fmtTime(T.sessionEnd(x))}`;

// ---- partes comuns ----
function Side({ p, uses }) {
  const progNames = [...new Set(uses.map((x) => x.room).filter((r) => r && r !== `Sala ${p.num}`))];
  const bigNum = p.num || '';
  const kind = p.kind === 'area' && !p.num ? '' : KIND[p.kind];
  // Nome no lugar do número: nunca quebra no meio da palavra; palavras longas ("Escovódromo") entram menores.
  const longest = Math.max(...String(p.name).split(/\s+/).map((w) => w.length));
  const textCls = longest >= 11 ? 'xl' : longest >= 9 ? 'lg' : '';
  return (
    <aside className="pl-side">
      <div className="pl-art"><img src="img/arte-topo.jpg" alt="" /></div>
      <div className="pl-kind">{kind}</div>
      {bigNum ? <div className={`pl-num ${bigNum.length > 2 ? 'long' : ''}`}>{bigNum}</div> : <div className={`pl-num text ${textCls}`}>{p.name}</div>}
      <div className="pl-name">{bigNum ? p.name : ''}{progNames.length ? <small>{progNames.join(' · ')} na programação dos cursos</small> : null}</div>
      <div className="pl-qr"><div className="pl-qr-box"><Qr text={T.appUrl(`#mapa?local=${p.venue}&p=${p.id}`)} cell={4} margin={1} dark="#0b1b3a" light="#ffffff" /></div><span>Aponte a câmera do celular: caminho até aqui no mapa da escola</span></div>
    </aside>
  );
}
const Head = ({ p }) => <header className="pl-head"><img className="pl-marca" src="img/arte-marca.png" alt="TCE na Comunidade" /><div className="pl-head-t"><b>{D.event.edition}</b><span>{D.maps[p.venue].title}</span></div><img className="pl-logo" src="img/tce-logo.png" alt="Tribunal de Contas do Estado do Amapá" /></header>;
const Foot = () => <footer className="pl-foot"><span>{D.event.datesLabel} · www.tce.ap.gov.br/tce-na-comunidade</span><span>Cursos: inscrição pelo site da ESCON · Serviços: por ordem de chegada</span></footer>;
const Sheet = ({ p, uses, cls, children }) => (
  <article className={`placa ${p.kind} ${cls}`} data-place={p.id}><div className="pl-band" /><Side p={p} uses={uses} /><section className="pl-main"><Head p={p} /><div className={`pl-body ${cls}`}>{children}</div><Foot /></section></article>
);
const SvcIcon = ({ s }) => <span className="pl-ico" style={{ '--c': s.color }}><Icon name={s.icon} /></span>;

// ---- versão consolidada: tudo o que acontece na sala ----
function Consolidada({ p, uses, showAll }) {
  const svcs = servicesAt(p); const sd = svcDay(p.venue);
  if (!uses.length && !svcs.length && !showAll) return null;
  const byDay = {}; for (const x of uses) (byDay[x.date] = byDay[x.date] || []).push(x);
  const dayKeys = Object.keys(byDay).sort();
  const n = uses.length + svcs.length;
  const empty = !dayKeys.length && !svcs.length;
  return (
    <Sheet p={p} uses={uses} cls={n <= 3 ? 'few' : ''}>
      {dayKeys.map((d) => <div key={d} className="pl-day"><h3>{cap(T.fmtDate(d, 'wdlong'))}</h3>{byDay[d].map((x, k) => <div key={k} className="pl-row"><span className="pl-time">{range(x)}</span><span className="pl-what"><b>{nb(T.title(x.course))}</b>{x.label ? <> <small className="inl">· {x.label}</small></> : null}<small>{x.course.audience}</small></span></div>)}</div>)}
      {svcs.length ? <div className="pl-day pl-svc"><h3>{cap(T.fmtDate(sd.date, 'wdlong'))} · Serviços</h3>{svcs.map((s) => { const its = itemsAt(s, p); return <div key={s.id} className="pl-row"><SvcIcon s={s} /><span className="pl-what"><b>{nb(s.title)}</b><small>{its.length ? its.map((it) => T.itemText(it)).join(' · ') : s.summary}</small></span></div>; })}</div> : null}
      {empty ? <p className="pl-empty">Sem atividade cadastrada neste local.</p> : null}
    </Sheet>
  );
}

// ---- versão destaque: uma folha por curso e por serviço ----
function Destaque({ p, uses }) {
  const svcs = servicesAt(p); const sd = svcDay(p.venue);
  const byCourse = {}; for (const x of uses) (byCourse[x.course.id] = byCourse[x.course.id] || []).push(x);
  return (
    <>
      {Object.keys(byCourse).map((id) => { const xs = byCourse[id]; const c = xs[0].course; return (
        <Sheet key={`c-${id}`} p={p} uses={uses} cls="solo curso">
          <div className="pl-label">Curso gratuito</div><h2 className="pl-big">{nb(c.title)}</h2>
          <div className="pl-sessions">{xs.map((x, k) => <div key={k} className="pl-sess"><Icon name="calendar" /><span>{when(x)}</span>{x.label ? <small>{x.label}</small> : null}</div>)}</div>
          <p className="pl-aud"><b>Para:</b> {c.audience}</p>
          <p className="pl-meta">{c.hours}h de carga horária · {c.seats} vagas · inscrição pelo site da ESCON (curso {c.id})</p>
        </Sheet>); })}
      {svcs.map((s) => { const its = itemsAt(s, p); return (
        <Sheet key={`s-${s.id}`} p={p} uses={uses} cls="solo servico">
          <div className="pl-label">Serviços · {cap(T.fmtDate(sd.date, 'wdlong'))}</div>
          <h2 className="pl-big"><SvcIcon s={s} />{nb(s.title)}</h2>
          {its.length ? <ul className="pl-items">{its.map((it, k) => <li key={k}>{T.itemText(it)}</li>)}</ul> : <p className="pl-aud">{s.summary}</p>}
          <p className="pl-meta">Sem inscrição, por ordem de chegada · {s.partners.slice(0, 4).join(' · ')}</p>
        </Sheet>); })}
    </>
  );
}

export default function Placas() {
  const rootRef = useRef(null);
  // ---- filtros (lidos uma vez, no cliente) ----
  const cfg = useMemo(() => {
    const q = T.params;
    const mode = q.get('modo') === 'destaque' ? 'destaque' : 'consolidada';
    const venues = (q.get('local') || 'jn,manga').split(',').filter((v) => D.maps[v]);
    const only = (q.get('sala') || '').split(',').filter(Boolean);
    const showAll = q.get('todas') === '1';
    return { mode, venues, only, showAll };
  }, []);
  const { mode, venues, only, showAll } = cfg;
  const all = useMemo(() => T.allSessions(), []);
  const usesOf = (p) => all.filter((x) => { const pl = T.courseRoomPlace(x); return pl && pl.id === p.id; });
  const placesFor = (venue) => D.maps[venue].places.filter((p) => !p.hide).map((p) => Object.assign({ venue }, p)).sort(roomSort);

  // Folhas: mesma lógica do site antigo (destaque gera 0..n folhas por sala; consolidada 0..1).
  const sheets = [];
  for (const v of venues) for (const p of placesFor(v)) {
    if (only.length && !only.includes(p.id)) continue;
    const uses = usesOf(p); const svcs = servicesAt(p);
    if (mode === 'destaque') { const byCourse = new Set(uses.map((x) => x.course.id)); if (byCourse.size + svcs.length) sheets.push(<Destaque key={p.id} p={p} uses={uses} />); }
    else if (uses.length || svcs.length || showAll) sheets.push(<Consolidada key={p.id} p={p} uses={uses} showAll={showAll} />);
  }
  const count = mode === 'destaque'
    ? venues.flatMap((v) => placesFor(v)).filter((p) => !only.length || only.includes(p.id)).reduce((n, p) => n + new Set(usesOf(p).map((x) => x.course.id)).size + servicesAt(p).length, 0)
    : sheets.length;

  const modeQ = mode === 'destaque' ? 'modo=destaque' : '';
  const localQ = venues.length === 1 ? `local=${venues[0]}` : '';
  const join = (...xs) => xs.filter(Boolean).join('&');
  const Link = ({ label, params, on }) => <a className={on ? 'on' : ''} href={`placas.html${params ? '?' + params : ''}`}>{label}</a>;

  // Texto no maior tamanho que cabe: ajusta --k (mm) de cada painel por tentativa, do maior para o menor.
  useLayoutEffect(() => {
    const root = rootRef.current; if (!root) return;
    const fit = () => {
      root.querySelectorAll('.pl-body').forEach((body) => {
        body.classList.remove('dense');
        const fits = () => body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1;
        // Ponto de partida: folhas com pouco conteúdo podem crescer mais (o laço reduz até caber).
        let k = body.classList.contains('solo') ? 12 : body.classList.contains('few') ? 11 : 9.5;
        for (; k >= 3; k -= 0.25) { body.style.setProperty('--k', k); if (fits()) return; }
        body.classList.add('dense'); // ainda não coube: esconde o público
        for (k = 4; k >= 2.6; k -= 0.2) { body.style.setProperty('--k', k); if (fits()) return; }
      });
    };
    const zoom = () => { const w = root.clientWidth - 2; root.style.setProperty('--z', Math.min(1, w / 1123).toFixed(4)); };
    zoom(); fit();
    window.addEventListener('resize', zoom);
    window.addEventListener('beforeprint', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    return () => { window.removeEventListener('resize', zoom); window.removeEventListener('beforeprint', fit); };
  }, [cfg]);

  return (
    <div id="placas" className="pl" ref={rootRef}>
      <div className="pl-tools">
        <div className="pl-tools-l"><b>Placas de porta</b><span>{mode === 'destaque' ? 'Uma folha por curso ou serviço' : 'Uma folha por sala, com tudo o que acontece nela'} · {count} folha{count === 1 ? '' : 's'} A4 paisagem · imprimir em cores, sem margens</span></div>
        <div className="pl-tools-r">
          <span className="pl-group"><Link label="Consolidada" params={join(localQ)} on={mode === 'consolidada'} /><Link label="Por curso / serviço" params={join('modo=destaque', localQ)} on={mode === 'destaque'} /></span>
          <span className="pl-group"><Link label="Todas" params={join(modeQ)} on={venues.length === 2} />{Object.values(D.maps).map((m) => <Link key={m.venue} label={m.short} params={join(modeQ, `local=${m.venue}`)} on={venues.length === 1 && venues[0] === m.venue} />)}</span>
          <button onClick={() => window.print()}><Icon name="download" />Imprimir / PDF</button>
        </div>
      </div>
      <div className="pl-sheets">{sheets}</div>
    </div>
  );
}
