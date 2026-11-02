import '@tce/core/css/tv.css';
import Tv from '@/components/tv/Tv';

/*
  Modo TV (sem interação): programação do dia inteira + 2 destaques + QR Code. Parâmetros na URL:
    ?local=jn|manga|sebrae|auditorio|iaparra|todos   local onde a TV está (padrão: jn = Escola Joaquim Nabuco)
    ?t=HH:MM&d=AAAA-MM-DD                      simula data/hora (demonstração)
    ?zoom=0.9   ?theme=light   ?orientation=portrait   ?app=https://…/  (endereço do app para o QR Code)
  Teclas: F tela cheia · + − 0 escala do texto · L claro/escuro · → ← troca os destaques · Esc limpa ajustes salvos
*/
export const metadata = {
  title: 'TCE na Comunidade · Painel',
  description: 'Mural para TV: programação de cursos, salas e serviços do TCE na Comunidade — 9ª Edição, Oiapoque e Distrito do Manga.',
  robots: { index: false, follow: false },
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#070f22' };

export default function Page() {
  return <Tv />;
}
