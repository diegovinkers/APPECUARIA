import net from 'node:net';

// Toma la IP real de un encabezado que pone el proxy (por ejemplo X-Real-IP en
// Railway) y la deja en req.ip, que es lo que usan el límite por IP, las
// sesiones y la auditoría. Si el encabezado falta o no es una IP, req.ip queda
// como lo calcula Express.
export function ipReal(encabezado) {
  return (req, res, next) => {
    const valor = req.get(encabezado)?.split(',')[0].trim();
    if (valor && net.isIP(valor)) {
      Object.defineProperty(req, 'ip', { value: valor, configurable: true, enumerable: true });
    }
    next();
  };
}
