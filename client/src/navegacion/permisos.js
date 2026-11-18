// Cómo se llama cada acción en cada módulo, para que la matriz de permisos y
// los resúmenes se entiendan sin saber de "VER/CREAR/EDITAR/APROBAR/ANULAR".
// Lo que no está acá usa el nombre genérico.
const GENERICO = { VER: 'Ver', CREAR: 'Crear', EDITAR: 'Editar', APROBAR: 'Aprobar', ANULAR: 'Anular' };

const POR_MODULO = {
  pecuaria: { VER: 'Ver', CREAR: 'Registrar', EDITAR: 'Importar y configurar', APROBAR: 'Aprobar', ANULAR: 'Revertir' },
  usuarios: { VER: 'Ver', CREAR: 'Dar de alta', EDITAR: 'Roles, estancias y contraseñas', ANULAR: 'Activar y desactivar' },
  roles: { VER: 'Ver', CREAR: 'Crear', EDITAR: 'Editar', ANULAR: 'Borrar' },
  auditoria: { VER: 'Ver' },
};

export const etiquetaAccion = (modulo, accion) => POR_MODULO[modulo]?.[accion] ?? GENERICO[accion] ?? accion;

// Usuarios, Roles y Auditoría: solo el superadmin asigna roles con estos permisos.
export const MODULOS_ADMINISTRACION = ['usuarios', 'roles', 'auditoria'];

export const esRolDeAdministracion = (rol) => rol.permisos?.some((p) => MODULOS_ADMINISTRACION.includes(p.split(':')[0]));
