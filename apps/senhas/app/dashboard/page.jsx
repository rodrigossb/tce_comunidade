import Dashboard from '@/components/dash/Dashboard';
import '@/components/tv/tv.css';
import '@/components/dash/dash.css';

// Dashboard de resultados (16:9, mesmo formato da TV): números do dia de serviços para o encerramento da ação ou ao vivo.
// Parâmetros: ?local=jn|manga ?dia=AAAA-MM-DD ?tela=geral|servicos|salas|horas ?auto=0 ?zoom=1.1 ?t=&d= · tecla F tela cheia.
export const metadata = {
  title: 'Resultados · TCE na Comunidade',
  description: 'Dashboard de resultados dos serviços gratuitos do TCE na Comunidade: senhas, atendimentos, faltas, tempos e movimento por hora.',
  robots: { index: false, follow: false },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#070f22' };

export default function Page() { return <Dashboard />; }
