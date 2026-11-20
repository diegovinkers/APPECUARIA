// Íconos de línea (estilo Tabler, MIT), dibujados a mano para no sumar una
// librería. Heredan el color del texto.
const TRAZOS = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  cerrar: 'M18 6 6 18M6 6l12 12',
  mas: 'M12 5v14M5 12h14',
  derecha: 'm9 6 6 6-6 6',
  atras: 'M5 12h14M5 12l6 6M5 12l6-6',
  abajo: 'm6 9 6 6 6-6',
  achicar: 'm11 7-5 5 5 5M17 7l-5 5 5 5',
  agrandar: 'm7 7 5 5-5 5M13 7l5 5-5 5',
  resumen:
    'M3 13a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM15 9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z',
  potreros: 'M4 21V7l2-3 2 3v14M16 21V7l2-3 2 3v14M8 9h8M8 15h8',
  movimientos: 'M7 10h14l-4-4M17 14H3l4 4',
  traslado: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M5 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  multiple: 'M4 6h12l-3-3M20 12H8l3 3M4 18h12l-3-3',
  pecuaria: 'M12 10a6 6 0 0 0-6-6H3v2a6 6 0 0 0 6 6h3M12 14a6 6 0 0 1 6-6h3v1a6 6 0 0 1-6 6h-3M12 20V10',
  parcelas: 'M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3zM9 4v13M15 7v13',
  importar: 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 9l5-5 5 5M12 4v12',
  configuracion: 'M4 6h8M16 6h4M14 4v4M4 12h2M10 12h10M8 10v4M4 18h11M19 18h1M17 16v4',
  usuarios:
    'M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85',
  roles: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7zM9 12l2 2 4-4',
  perfil: 'M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2',
  salir: 'M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2M9 12h12l-3-3M18 15l3-3',
  entrada: 'M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2M21 12H8l3-3M11 15l-3-3',
  categoria:
    'M6.5 7.5a1 1 0 1 0 2 0 1 1 0 1 0-2 0M3 6v5.17a2 2 0 0 0 .59 1.42l7.71 7.71a2.41 2.41 0 0 0 3.41 0l5.59-5.59a2.41 2.41 0 0 0 0-3.41l-7.71-7.71A2 2 0 0 0 11.17 3H6a3 3 0 0 0-3 3',
  correccion: 'M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4M13.5 6.5l4 4',
  buscar: 'M3 10a7 7 0 1 0 14 0 7 7 0 1 0-14 0M21 21l-6-6',
  // Eventos (20/11).
  eventos:
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2M9 14l2 2 4-4',
  pesada: 'M7 20h10M6 6l6-1 6 1M12 3v17M9 12 6 6l-3 6a3 3 0 0 0 6 0M21 12l-3-6-3 6a3 3 0 0 0 6 0',
  recuento: 'M5 9h14M5 15h14M11 4 7 20M17 4l-4 16',
  destete: 'M10 3h4M12 3v2M9 7h6l1 3v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-9zM8 13h8',
  vacuna: 'M17 3l4 4M19 5l-4.5 4.5M11.5 6.5l6 6M16.5 11.5 10 18H6v-4l6.5-6.5M7.5 12.5 9 14M10.5 9.5 12 11M3 21l3-3',
  check: 'M5 12l5 5L20 7',
};

export default function Icono({ nombre, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
