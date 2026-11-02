import TvSenhas from '@/components/tv/TvSenhas';
import '@/components/tv/tv.css';

// TV das senhas (16:9, a distância): serviços e senhas em atendimento por sala. Parâmetros na URL
// (ver lib/tv-grupos.js): ?local=jn ?grupo=entrada|fundos ?salas=03,04 ?servicos=pilar-1 ?voz=1 ?zoom=1.1 ?t=&d=
export const metadata = {
  title: 'Senhas · TCE na Comunidade',
  description: 'Painel de TV das senhas dos serviços gratuitos do TCE na Comunidade.',
  robots: { index: false, follow: false },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#070f22' };

export default function Page() { return <TvSenhas />; }
