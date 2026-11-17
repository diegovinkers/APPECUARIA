import bcrypt from 'bcryptjs';

// Costo de bcrypt: cada +1 duplica el tiempo. 12 ≈ 0,3 s por login: no se nota
// al entrar, pero hace muy caro probar contraseñas de a millones si alguien
// se llevara una copia de la base. En los tests se usa uno bajo para que
// corran rápido.
export const BCRYPT_COSTO = process.env.NODE_ENV === 'test' ? 5 : 12;

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COSTO);

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

// Un hash de costo menor (por ejemplo, de antes de subir el costo) se rehace
// solo en el próximo login correcto.
export const necesitaRehash = (hash) => bcrypt.getRounds(hash) < BCRYPT_COSTO;

// Hash de relleno: si el usuario no existe se compara igual contra esto, así
// la respuesta tarda lo mismo y no delata qué usuarios existen.
export const DUMMY_HASH = bcrypt.hashSync('relleno-para-igualar-tiempos', BCRYPT_COSTO);
