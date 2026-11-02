import '@tce/core/css/resumo.css';
import '../resumo-cursos/cursos.css';
import ResumoCursos from '@/components/resumo/ResumoCursos';

// Resumo total (organização): totais de vagas, inscritos e vagas restantes por local e por dia, e as turmas de cada
// local com subtotal. Mesmos dados e filtros (?local=) do resumo de cursos. Imprimível em A4 paisagem.
export default function Page() {
  return <ResumoCursos variant="total" />;
}
