'use client';
// Botões do módulo de impressão: aplicar filtros (envia o formulário GET) e imprimir (window.print; some na impressão).
export default function PrintBar() {
  return (
    <div className="pr-actions">
      <button type="submit" className="btn btn-ghost" data-act="aplicar">Aplicar filtros</button>
      <button type="button" className="btn btn-primary" data-act="imprimir" onClick={() => { try { window.print(); } catch { /* navegador sem impressão */ } }}>Imprimir</button>
    </div>
  );
}
