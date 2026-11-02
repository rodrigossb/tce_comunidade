'use client';
/* Totem = o app do celular em modo quiosque (components/app/App.jsx com a prop `kiosk`). Configuração pela URL, lida
   uma vez no cliente:
     ?local=jn|manga|sebrae|auditorio|iaparra  local onde o totem está (programação inicial e mapa padrão)
     ?entrada=a1|a2|a3 | <id da sala, ex. jn-r11> | <x,y em px da planta>   posição do totem = origem de todos os caminhos
     ?ocioso=90   segundos sem toque para voltar ao início (mín. 20)      ?descanso=0   sem tela de descanso
     ?zoom=1.3    escala da letra (1 = celular; 1.3 bom para 42" em 1080×1920)   ?t=HH:MM&d=AAAA-MM-DD  simulação
   Tecla F: tela cheia. */
import { useEffect, useState } from 'react';
import { TCE as T } from '@tce/core';
import App from '@/components/app/App';

const D = T.D;
function readConfig() {
  const P = T.params;
  const local = D.venues[P.get('local')] ? P.get('local') : 'jn';
  const zoom = Math.min(2, Math.max(0.8, Number(P.get('zoom')) || 1.3));
  return { local, entrada: (P.get('entrada') || 'a1').trim(), idleMs: Math.max(20, Number(P.get('ocioso')) || 90) * 1000, attract: P.get('descanso') !== '0', zoom };
}

export default function TotemKiosk() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { setCfg(readConfig()); }, []);
  if (!cfg) return <div id="app" className="app kiosk"><div className="app-loading">Carregando…</div></div>;
  return <App kiosk={cfg} />;
}
