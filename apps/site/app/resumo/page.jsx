'use client';
import '@tce/core/css/map.css';
import '@tce/core/css/resumo.css';
import { useMounted } from '@/lib/hooks';
import Resumo from '@/components/resumo/Resumo';

/* Resumo da organização (documento para a equipe): capa com sumário, visão geral, programação por dia e
   local, plantas, índice A–Z dos cursos e pendências. Só leitura; impressão em A4. Montado no cliente a
   partir de @tce/core (dados, salas dos cursos e plantas). */
export default function Page() {
  const mounted = useMounted();
  return <div id="resumo" className="rs">{mounted ? <Resumo /> : <p className="rs-loading">Montando o resumo…</p>}</div>;
}
