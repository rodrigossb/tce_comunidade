import { ICON_PATHS } from '@tce/core/icons';

/** Ícone SVG inline (mesmo desenho de TCE.icon no site antigo). <Icon name="map" /> */
export default function Icon({ name, className, size = 24 }) {
  const d = ICON_PATHS[name] || ICON_PATHS.info;
  return (
    <svg className={`ico${className ? ' ' + className : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: d }} />
  );
}
