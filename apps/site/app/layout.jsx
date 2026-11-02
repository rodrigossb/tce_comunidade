import '@tce/core/css/base.css';

export const metadata = {
  title: 'TCE na Comunidade · Oiapoque 2026',
  description: 'Programação completa do TCE na Comunidade — 9ª Edição, Oiapoque e Distrito do Manga, 03 a 07/11/2026: cursos gratuitos, horários, salas, inscrições e serviços.',
  icons: { icon: 'img/tce-mark.png', apple: 'img/tce-mark.png' },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1f3b9a' };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
