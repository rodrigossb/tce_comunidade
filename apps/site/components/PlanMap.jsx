'use client';
import { useMemo } from 'react';
import { mapOf, entranceOf, route, placeFull, dist } from '@tce/core/map';

/**
 * Planta do local com marcadores e rota a pé (porta do componente imperativo TCEMap.render do site antigo).
 * props: venue, entrance (id do acesso), place (id em destaque), alias (nome alternativo da sala em destaque),
 * highlight (ids em destaque leve), showAll, scale, onPick(id), onEntrance(id).
 * Precisa do CSS @tce/core/css/map.css na página.
 */
export default function PlanMap({ venue, entrance, place, alias, highlight, showAll, scale, onPick, onEntrance, className, style }) {
  const hlKey = (highlight || []).join(',');
  const model = useMemo(() => {
    const map = mapOf(venue); if (!map) return null;
    const from = entranceOf(map, entrance);
    const r = place ? route(venue, place, from.id, alias) : null;
    const hl = new Set(highlight || []);
    const places = map.places.filter((p) => !p.hide || p.id === place).map((p) => (alias && p.id === place ? Object.assign({}, p, { name: alias }) : p));
    const S = (Math.max(map.w, map.h) / 1000) * (scale || 1);
    const labelSoft = hl.size > 0 && hl.size <= 6 && !place;
    const softOrder = [...hl].map((id) => places.find((p) => p.id === id)).filter(Boolean).sort((a, b) => a.x - b.x).map((p) => p.id);
    const pts = r ? r.points.map((p) => p.join(',')).join(' ') : '';
    const len = r ? r.points.reduce((n, p, i) => (i ? n + dist(r.points[i - 1], p) : 0), 0) : 0;
    return { map, from, r, hl, places, S, labelSoft, softOrder, pts, len };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue, entrance, place, alias, hlKey, showAll, scale]);
  if (!model) return null;
  const { map, from, r, hl, places, S, labelSoft, softOrder, pts, len } = model;

  const pin = (p) => {
    const on = p.id === place; const soft = hl.has(p.id); const rr = (on ? 30 : soft ? 22 : 17) * S;
    const cls = `mk ${p.kind} ${on ? 'on' : ''} ${soft ? 'soft' : ''} ${showAll || on || soft ? '' : 'dim'}`;
    const crowded = soft && [...hl].some((id) => { const q = places.find((x) => x.id === id); return q && q !== p && Math.abs(q.y - p.y) < map.h * 0.06 && Math.abs(q.x - p.x) < map.w * 0.14; });
    const lblText = on ? placeFull(p) : (soft && labelSoft && !crowded ? p.name : '');
    const below = !on && softOrder.indexOf(p.id) % 2 === 1;
    const hw = lblText.length * 5.4 * S + 16 * S; const dx = Math.max(-(p.x - hw - 6 * S), Math.min(0, map.w - 6 * S - (p.x + hw)));
    return (
      <g key={p.id} className={cls} data-place={p.id} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button" aria-label={placeFull(p)}
        onClick={onPick ? () => onPick(p.id) : undefined} onKeyDown={onPick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p.id); } } : undefined}>
        {(on || soft) && <circle className="pulse" r={rr * 1.6} />}
        <circle r={rr} />
        <text dy={rr * 0.36} fontSize={rr * 1.05}>{p.num || '•'}</text>
        {lblText ? (
          <g className={`lbl ${on ? '' : 'soft'}`} transform={`translate(${dx} ${below ? rr + 34 * S : -rr - 10 * S})`}>
            <rect x={-hw} y={-24 * S} width={hw * 2} height={30 * S} rx={8 * S} />
            <text fontSize={16 * S} dy={-3 * S}>{lblText}</text>
          </g>
        ) : null}
      </g>
    );
  };
  return (
    <div className={`tcemap${className ? ' ' + className : ''}`} data-venue={venue} style={style}>
      <div className="tcemap-frame" style={{ aspectRatio: `${map.w}/${map.h}` }}>
        <img src={map.image} alt={`Planta: ${map.title}`} draggable={false} />
        <svg viewBox={`0 0 ${map.w} ${map.h}`} xmlns="http://www.w3.org/2000/svg" style={{ '--s': S }}>
          {r ? (
            <>
              <polyline className="rt-halo" points={pts} strokeWidth={22 * S} />
              <polyline className="rt" points={pts} strokeWidth={10 * S} strokeDasharray={`${24 * S} ${18 * S}`} style={{ '--len': len }} />
              <circle className="rt-walk" r={11 * S}>
                <animateMotion dur={`${Math.max(4, len / 180)}s`} repeatCount="indefinite" path={`M${r.points.map((p, i) => (i ? 'L' : '') + p.join(' ')).join(' ')}`} />
              </circle>
            </>
          ) : null}
          {places.filter((p) => p.id !== place).map(pin)}
          {map.entrances.map((e) => {
            const here = e.id === from.id;
            return (
              <g key={e.id} className={`ent ${here ? 'here' : ''}`} data-entrance={e.id} transform={`translate(${e.x} ${e.y})`} role="button" tabIndex={0} aria-label={e.label}
                onClick={onEntrance ? () => onEntrance(e.id) : undefined}>
                <circle r={18 * S} />
                <text dy={6 * S} fontSize={16 * S}>{here ? '★' : e.id.slice(1)}</text>
                {here ? (
                  <g className="lbl here" transform={`translate(0 ${30 * S})`}>
                    <rect x={-80 * S} y="0" width={160 * S} height={28 * S} rx={8 * S} />
                    <text y={20 * S} fontSize={15 * S}>Você está aqui</text>
                  </g>
                ) : null}
              </g>
            );
          })}
          {place ? places.filter((p) => p.id === place).map(pin) : null}
        </svg>
      </div>
    </div>
  );
}
