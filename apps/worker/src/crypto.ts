const encoder = new TextEncoder();
const iterations = 310_000;

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

async function derive(password: string, salt: Uint8Array, rounds: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
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

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${encode(salt)}$${encode(await derive(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, roundsValue, saltValue, expectedValue] = stored.split('$');
  if (algorithm !== 'pbkdf2-sha256' || !roundsValue || !saltValue || !expectedValue) return false;
  const rounds = Number(roundsValue);
  if (!Number.isInteger(rounds) || rounds < 100_000 || rounds > 1_000_000) return false;
  const actual = await derive(password, decode(saltValue), rounds);
  const expected = decode(expectedValue);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1)
    difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  return difference === 0;
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
