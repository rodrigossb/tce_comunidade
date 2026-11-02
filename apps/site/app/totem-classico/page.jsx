import '@tce/core/css/map.css';
import '@tce/core/css/totem.css';
import Totem from '@/components/totem/Totem';

// Totem clássico (layout próprio, anterior a 02/11/2026); o totem atual é totem.html (app em modo quiosque). Tela vertical grande por toque (ex.: 42" em 1080×1920), uso em pé. Parâmetros na URL:
//   ?local=jn|manga|sebrae|auditorio|iaparra  ?ocioso=90  ?descanso=0  ?t=HH:MM&d=AAAA-MM-DD  ?app=https://…/  ?entrada=a1
// Tecla F: tela cheia. Detalhes em components/totem/Totem.jsx.
export const metadata = {
  title: 'TCE na Comunidade · Totem clássico',
  description: 'Totem de autoatendimento do TCE na Comunidade — 9ª Edição, Oiapoque e Distrito do Manga: programação, cursos, serviços e locais.',
  robots: { index: false, follow: false },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1f3b9a' };

export default function Page() {
  return <Totem />;
}
