import '@tce/core/css/base.css';
import '@tce/core/css/app.css';
import '@tce/core/css/atendimento.css';

const BP = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const metadata = {
  title: 'Atendimento · TCE na Comunidade',
  description: 'Controle de senhas dos serviços do TCE na Comunidade: triagem, chamada na porta da sala e painel de acompanhamento.',
  robots: { index: false, follow: false },
  icons: { icon: `${BP}/img/tce-mark.png` },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1f3b9a' };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
