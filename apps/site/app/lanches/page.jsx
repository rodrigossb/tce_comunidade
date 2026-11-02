import '@tce/core/css/resumo.css';
import './lanches.css';
import Lanches from '@/components/resumo/Lanches';

// Painel de lanches (fornecedora de alimentação): alunos inscritos por local, dia e turno, com detalhe das turmas.
// Inscritos do painel da ESCON (API do tce-senhas / inscritos.json / localStorage); sem dado, conta as vagas.
// Filtros ?local=, ?dia=, ?margem=. Imprimível em A4 retrato; botão "Copiar texto" para WhatsApp/e-mail.
export default function Page() {
  return <Lanches />;
}
