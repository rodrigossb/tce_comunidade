import '@tce/core/css/resumo.css';
import './cursos.css';
import ResumoCursos from '@/components/resumo/ResumoCursos';

// Resumo focado em cursos (organização): turmas por dia e local, vagas, inscritos e vagas restantes.
// Os inscritos vêm do painel administrativo da ESCON, lido pelo navegador de quem abre a página
// (?k=chave, ou colando o conteúdo do painel). Imprimível em A4 paisagem.
export default function Page() {
  return <ResumoCursos />;
}
