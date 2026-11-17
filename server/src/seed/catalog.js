// Datos iniciales. Todo es de ejemplo y PROVISORIO: módulos y roles son filas
// de la base y se editan desde la app; el seed solo crea lo que falta.
// Los usuarios de ejemplo son ficticios (dominio reservado .test).

// clave: identificador estable que usa el código. nombre: lo que se ve.
// Los nombres de los cuatro primeros siguen a los módulos de CIGAM.
export const MODULOS = [
  { clave: 'pecuaria', nombre: 'Pecuaria', orden: 5 },
  { clave: 'gestao-materiais', nombre: 'Gestão de Materiais', orden: 10 },
  { clave: 'compras', nombre: 'Compras', orden: 20 },
  { clave: 'recebimento', nombre: 'Recebimento/Pré Nota', orden: 30 },
  { clave: 'gestao-financeira', nombre: 'Gestão Financeira', orden: 40 },
  { clave: 'usuarios', nombre: 'Usuarios', orden: 90, esAdministracion: true },
  { clave: 'roles', nombre: 'Roles', orden: 91, esAdministracion: true },
  { clave: 'auditoria', nombre: 'Auditoría', orden: 92, esAdministracion: true },
];

const TODAS = ['VER', 'CREAR', 'EDITAR', 'APROBAR', 'ANULAR'];

// permisos: { claveDelModulo: [acciones] }
export const ROLES = [
  {
    nombre: 'Administrador',
    descripcion: 'Crea y desactiva usuarios y les asigna roles. Ve la auditoría.',
    permisos: { usuarios: ['VER', 'CREAR', 'EDITAR', 'ANULAR'], roles: ['VER'], auditoria: ['VER'] },
  },
  {
    nombre: 'Solicitante',
    descripcion: 'Carga solicitudes de compra.',
    permisos: { 'gestao-materiais': ['VER'], compras: ['VER', 'CREAR', 'EDITAR'] },
  },
  {
    nombre: 'Comprador',
    descripcion: 'Gestiona las compras.',
    permisos: { 'gestao-materiais': ['VER'], compras: ['VER', 'CREAR', 'EDITAR', 'ANULAR'], recebimento: ['VER'] },
  },
  {
    nombre: 'Aprobador',
    descripcion: 'Aprueba compras.',
    permisos: { compras: ['VER', 'APROBAR'], 'gestao-financeira': ['VER'] },
  },
  {
    nombre: 'Recepción',
    descripcion: 'Registra la recepción de mercadería.',
    permisos: { 'gestao-materiais': ['VER'], compras: ['VER'], recebimento: ['VER', 'CREAR', 'EDITAR'] },
  },
  {
    nombre: 'Financiero',
    descripcion: 'Gestión financiera de lo recibido.',
    permisos: { compras: ['VER'], recebimento: ['VER'], 'gestao-financeira': TODAS },
  },
];

// Ficticios. Solo se crean fuera de producción y si SEED_PASSWORD_EJEMPLO
// está definida. Algunos sin email a propósito (es opcional).
export const USUARIOS_EJEMPLO = [
  { usuario: 'admin.demo', nombre: 'Administrador Demo', email: 'admin.demo@ejemplo.test', roles: ['Administrador'] },
  { usuario: 'solicitante.demo', nombre: 'Solicitante Demo', email: 'solicitante.demo@ejemplo.test', roles: ['Solicitante'] },
  { usuario: 'comprador.demo', nombre: 'Comprador Demo', email: 'comprador.demo@ejemplo.test', roles: ['Comprador'] },
  { usuario: 'aprobador.demo', nombre: 'Aprobador Demo', email: 'aprobador.demo@ejemplo.test', roles: ['Aprobador'] },
  { usuario: 'recepcion.demo', nombre: 'Recepción Demo', email: null, roles: ['Recepción'] },
  { usuario: 'financiero.demo', nombre: 'Financiero Demo', email: 'financiero.demo@ejemplo.test', roles: ['Financiero'] },
  { usuario: 'multirol.demo', nombre: 'Multirol Demo', email: null, roles: ['Comprador', 'Recepción'] },
];
