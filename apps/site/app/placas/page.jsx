'use client';
import '@tce/core/css/placas.css';
import './print.css';
import { useMounted } from '@/lib/hooks';
import Placas from '@/components/placas/Placas';

/* Placas de porta (A4 paisagem): uma folha por sala (consolidada) ou por curso/serviço (?modo=destaque).
   Filtros: ?local=jn|manga  ?sala=jn-r08,jn-r09  ?todas=1. Imprimir sem margens. Montado no cliente. */
export default function Page() {
  const mounted = useMounted();
  return mounted ? <Placas /> : <div id="placas" className="pl"><p className="pl-loading">Montando as placas…</p></div>;
}
