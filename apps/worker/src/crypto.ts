const encoder = new TextEncoder();
// Workerd's Web Crypto implementation rejects PBKDF2 requests above 100,000
// iterations. Keep this portable with the Node profile and version it in the hash.
const iterations = 100_000;

const encode = (bytes: Uint8Array) => {
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const decode = (value: string) => {
  const standard = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(standard);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function hmac(value: string, authRootSecret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authRootSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function derive(material: Uint8Array, salt: Uint8Array, rounds: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    material.slice().buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: salt.slice().buffer as ArrayBuffer,
        iterations: rounds,
      },
      key,
      256,
    ),
  );
}

export async function hashPassword(password: string, authRootSecret: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await hmac(`password\0${password}`, authRootSecret);
  return `pbkdf2-sha256-v2$${iterations}$${encode(salt)}$${encode(await derive(material, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string, authRootSecret: string) {
  const [algorithm, roundsValue, saltValue, expectedValue] = stored.split('$');
  if (
    algorithm === undefined ||
    !['pbkdf2-sha256', 'pbkdf2-sha256-v2'].includes(algorithm) ||
    !roundsValue ||
    !saltValue ||
    !expectedValue
  )
    return false;
  const rounds = Number(roundsValue);
  if (!Number.isInteger(rounds) || rounds < 100_000 || rounds > 1_000_000) return false;
  const material =
    algorithm === 'pbkdf2-sha256-v2'
      ? await hmac(`password\0${password}`, authRootSecret)
      : encoder.encode(password);
  const actual = await derive(material, decode(saltValue), rounds);
  const expected = decode(expectedValue);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1)
    difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  return difference === 0;
}

export async function keyedHash(value: string, authRootSecret: string) {
  return Array.from(await hmac(`session\0${value}`, authRootSecret))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256(value: string | ArrayBuffer | Uint8Array) {
  const input =
    typeof value === 'string'
      ? encoder.encode(value).buffer
      : value instanceof Uint8Array
        ? (value.slice().buffer as ArrayBuffer)
        : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', input)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export const opaqueToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
