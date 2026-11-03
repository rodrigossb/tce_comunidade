import 'leaflet/dist/leaflet.css';
import '@tce/core/css/mapa-eventos.css';
import MapaEventos from '@/components/mapa/MapaEventos';

// Mapa dos locais do evento com rota: um pino por local (Joaquim Nabuco, Aldeia do Manga, SEBRAE, Auditório),
// endereço, o que acontece ali e botões que abrem a rota no Google Maps ou no Waze. ?local=jn abre focado num local.
export const metadata = {
  title: 'IX TCE na Comunidade · Mapa dos locais',
  description: 'Onde acontece o TCE na Comunidade em Oiapoque e no Distrito do Manga, com rota pelo Google Maps ou Waze.',
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#1f3b9a' };

export default function Page() {
  return <MapaEventos />;
}
