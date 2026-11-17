// Catálogos iniciales de Pecuaria, tomados de cómo escribe la planilla de
// cargas el encargado (DECISIONES §10). Son vocabulario ganadero genérico,
// sin datos de la empresa. Se editan desde la app: el seed solo los crea si
// el catálogo está vacío.

// grupo = columna del resumen por campo. CN y VERDEO son un supuesto hasta
// que lo confirme el encargado; se cambia desde la app.
export const USOS_SUELO = [
  { nombre: 'Campo natural', grupo: 'CN', alias: ['CN', 'C. Natural'] },
  { nombre: 'Raygras', grupo: 'VERDEO' },
  { nombre: 'Festuca nueva', grupo: 'VERDEO' },
  { nombre: 'Festuca vieja', grupo: 'VERDEO' },
  // Sin distinguir forrajero (F) de silero (S) por ahora.
  { nombre: 'Sorgo', grupo: 'VERDEO' },
  { nombre: 'PP+', grupo: 'VERDEO' },
  { nombre: 'Semillero', grupo: 'OTRO' },
  { nombre: 'Arroz', grupo: 'OTRO' },
  // Los pivots y cualquier potrero sin uso en la planilla.
  { nombre: 'Sin uso cargado', grupo: 'OTRO' },
  { nombre: 'Corral', grupo: 'CORRAL' },
];

// Las 11 formas en que la planilla de EG escribe las categorías. Las que solo
// cambian en singular o plural van como alias de la misma categoría.
// "Terneros chicos" es una categoría propia (decisión del 17/11/2026).
export const CATEGORIAS = [
  { nombre: 'Terneros', alias: ['Ternero'] },
  { nombre: 'Terneros chicos', alias: ['Ternero chico', 'Ternero chicos'] },
  { nombre: 'Terneras', alias: ['Ternera'] },
  { nombre: 'Terneras chicas', alias: ['Ternera chica'] },
  { nombre: 'Vacas', alias: ['Vaca'] },
  { nombre: 'Vacas paridas', alias: ['Vaca parida'] },
  { nombre: 'Vacas invernar', alias: ['Vaca invernar', 'Vacas de invernada'] },
  { nombre: 'Vacas CUT', alias: ['Vaca CUT'] },
  { nombre: 'Vaquillonas paridas', alias: ['VAQ. PARIDA', 'Vaq parida', 'Vaquillona parida'] },
];

export const PARAMETROS = [
  { clave: 'KG_POR_UG', valor: 380, descripcion: 'Kilos de peso vivo que equivalen a 1 UG (unidad ganadera)' },
];

// Niveles a los que se aplica un movimiento (PROPUESTA_MOVIMIENTOS §5). Las
// casillas "a veces" (~) cuentan como permitidas: se ajustan desde la app.
const TODOS = ['CAMPO', 'POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE'];
const MOVER = ['POTRERO', 'CATEGORIA', 'LOTE', 'PARTE_LOTE'];

// Tipos de movimiento y evento ("libro del rodeo", PROPUESTA_MOVIMIENTOS).
// cigam = id en TEA4TIPOEVENTO. El orden de la lista es el orden en la app.
// Los 5 primeros son los que ya usa la app para mover (ver MODO_A_TIPO); la
// migración `tipos_de_movimiento` los crea igual que acá.
export const TIPOS_MOVIMIENTO = [
  // 1. Cambios de lugar o de grupo
  { clave: 'SUMAR_LOTE', nombre: 'Sumar a otro lote', efecto: 'MUEVE', niveles: MOVER, cigam: '5' },
  { clave: 'LOTE_NUEVO', nombre: 'Formar un lote nuevo', efecto: 'MUEVE', niveles: MOVER, cigam: '5' },
  { clave: 'LOTE_ENTERO', nombre: 'Mover el lote entero', efecto: 'MUEVE', niveles: ['POTRERO', 'CATEGORIA', 'LOTE'], cigam: '4' },
  { clave: 'CAMBIO_CATEGORIA', nombre: 'Cambio de categoría', efecto: 'CATEGORIA', niveles: MOVER },
  { clave: 'REVERSION', nombre: 'Reversión', efecto: 'MUEVE', niveles: ['LOTE', 'PARTE_LOTE'] },
  // 2. Entradas
  { clave: 'NACIMIENTO', nombre: 'Nacimiento / parto', efecto: 'ENTRA', niveles: ['LOTE', 'PARTE_LOTE'], cigam: '12' },
  { clave: 'COMPRA', nombre: 'Compra', efecto: 'ENTRA', pideGuia: true, niveles: ['LOTE'] },
  { clave: 'TRASLADO_ENTRADA', nombre: 'Traslado desde otro campo', efecto: 'ENTRA', pideGuia: true, niveles: ['LOTE'] },
  // 3. Salidas
  { clave: 'MUERTE', nombre: 'Muerte', efecto: 'SALE', pideCausa: true, niveles: ['LOTE', 'PARTE_LOTE'], cigam: '6' },
  { clave: 'CONSUMO', nombre: 'Consumo', efecto: 'SALE', pideCausa: true, niveles: ['PARTE_LOTE'], cigam: '7' },
  { clave: 'VENTA', nombre: 'Venta o faena', efecto: 'SALE', pideGuia: true, niveles: MOVER },
  { clave: 'TRASLADO_SALIDA', nombre: 'Traslado a otro campo', efecto: 'SALE', pideGuia: true, niveles: MOVER },
  { clave: 'PERDIDA', nombre: 'Pérdida o abigeato', efecto: 'SALE', niveles: ['LOTE', 'PARTE_LOTE'] },
  // 4. Eventos que no cambian cuántos animales hay
  { clave: 'PESADA', nombre: 'Pesada', efecto: 'REGISTRO', niveles: MOVER, cigam: '3' },
  { clave: 'ECOGRAFIA', nombre: 'Ecografía', efecto: 'REGISTRO', sexo: 'HEMBRA', niveles: ['CATEGORIA', 'LOTE', 'PARTE_LOTE'], cigam: '11' },
  { clave: 'INSEMINACION', nombre: 'Inseminación', efecto: 'REGISTRO', sexo: 'HEMBRA', niveles: ['CATEGORIA', 'LOTE', 'PARTE_LOTE'], cigam: '2' },
  { clave: 'ENTORE', nombre: 'Entore o servicio', efecto: 'REGISTRO', niveles: MOVER },
  { clave: 'ABORTO', nombre: 'Aborto', efecto: 'REGISTRO', sexo: 'HEMBRA', niveles: ['LOTE', 'PARTE_LOTE'] },
  // Separa a los terneros de las madres: forma un lote nuevo.
  { clave: 'DESTETE', nombre: 'Destete', efecto: 'MUEVE', niveles: ['POTRERO', 'LOTE', 'PARTE_LOTE'] },
  { clave: 'CASTRACION', nombre: 'Castración', efecto: 'REGISTRO', sexo: 'MACHO', niveles: ['CATEGORIA', 'LOTE', 'PARTE_LOTE'] },
  { clave: 'IDENTIFICACION', nombre: 'Caravaneo o señalada', efecto: 'REGISTRO', niveles: MOVER, cigam: '1' },
  { clave: 'VACUNA_CARBUNCLO', nombre: 'Vacuna carbunclo', efecto: 'REGISTRO', niveles: TODOS, cigam: '8' },
  { clave: 'VACUNA_AFTOSA', nombre: 'Vacuna aftosa', efecto: 'REGISTRO', niveles: TODOS, cigam: '9' },
  { clave: 'TRATAMIENTO', nombre: 'Otros tratamientos sanitarios', efecto: 'REGISTRO', niveles: TODOS },
  { clave: 'ALIMENTACION', nombre: 'Alimentación', efecto: 'REGISTRO', niveles: ['POTRERO', 'CATEGORIA', 'LOTE'], cigam: '13' },
  { clave: 'RECUENTO', nombre: 'Recuento', efecto: 'REGISTRO', niveles: ['CAMPO', 'POTRERO', 'LOTE'] },
].map((t, i) => ({
  clave: t.clave,
  nombre: t.nombre,
  efecto: t.efecto,
  pideCausa: t.pideCausa ?? false,
  pideGuia: t.pideGuia ?? false,
  sexo: t.sexo ?? 'CUALQUIERA',
  niveles: t.niveles,
  idTipoEventoCigam: t.cigam ?? null,
  orden: (i + 1) * 10,
}));

// Cada modo de la pantalla Mover → su tipo del catálogo. Estos tipos no se
// pueden desactivar ni cambiar de efecto: la app los usa.
export const MODO_A_TIPO = {
  SUMAR: 'SUMAR_LOTE',
  NUEVO: 'LOTE_NUEVO',
  ENTERO: 'LOTE_ENTERO',
  CATEGORIA: 'CAMBIO_CATEGORIA',
  REVERSION: 'REVERSION',
};

// Causas que hay hoy en CIGAM (TEA4CAUSAMOTIVOCONSTACAO). A qué tipo va cada
// una es un supuesto por el prefijo del código: hay que confirmarlo con el
// encargado y completar la lista (enfermedad, accidente, parto...).
export const CAUSAS = [
  { codigo: 'CA-001', nombre: 'Cobra', tipos: ['MUERTE'] },
  { codigo: 'MO-001', nombre: 'Mordida', tipos: ['MUERTE'] },
  { codigo: 'CO-001', nombre: 'Después de 3 días', tipos: ['CONSUMO'] },
  { codigo: 'CO-002', nombre: 'Después de 7 días', tipos: ['CONSUMO'] },
];
