import TotemKiosk from '@/components/totem/TotemKiosk';

// Totem (quiosque por toque, em pé): o mesmo app do celular, em modo quiosque. Parâmetros na URL (ver
// components/totem/TotemKiosk.jsx): ?local=jn ?entrada=a1|jn-r11|x,y ?ocioso=90 ?descanso=0 ?zoom=1.3 ?t=&d=
// O layout anterior continua em totem-classico.html.
export const metadata = {
  title: 'TCE na Comunidade · Totem',
  description: 'Totem de autoatendimento do TCE na Comunidade — 9ª Edição, Oiapoque e Distrito do Manga: programação, cursos, serviços e mapa.',
  robots: { index: false, follow: false },
};
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#1f3b9a' };

export default function Page() {
  return <TotemKiosk />;
}
