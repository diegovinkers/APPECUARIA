// Dónde se guardan las copias (27/11). Dos destinos con la misma forma:
// - R2 (Cloudflare), el de verdad: COPIAS_R2_CUENTA, COPIAS_R2_BUCKET,
//   COPIAS_R2_ACCESS_KEY_ID y COPIAS_R2_SECRET_ACCESS_KEY.
// - una carpeta, para probar en la compu sin R2: COPIAS_CARPETA.
// Cada uno tiene guardar(nombre, datos), leer(nombre) → Buffer | null.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AwsClient } from 'aws4fetch';

export function destinoR2({ cuenta, bucket, accessKeyId, secretAccessKey }) {
  const cliente = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
  const url = (nombre) => `https://${cuenta}.r2.cloudflarestorage.com/${bucket}/${nombre.split('/').map(encodeURIComponent).join('/')}`;
  return {
    descripcion: `R2 (${bucket})`,
    async guardar(nombre, datos, tipo = 'application/octet-stream') {
      const r = await cliente.fetch(url(nombre), { method: 'PUT', body: datos, headers: { 'Content-Type': tipo } });
      if (!r.ok) throw new Error(`R2 no guardó ${nombre}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    },
    async leer(nombre) {
      const r = await cliente.fetch(url(nombre));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`R2 no devolvió ${nombre}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      return Buffer.from(await r.arrayBuffer());
    },
  };
}

export function destinoCarpeta(carpeta) {
  return {
    descripcion: `carpeta ${carpeta}`,
    async guardar(nombre, datos) {
      const ruta = join(carpeta, nombre);
      await mkdir(dirname(ruta), { recursive: true });
      await writeFile(ruta, datos);
    },
    async leer(nombre) {
      try {
        return await readFile(join(carpeta, nombre));
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
  };
}
