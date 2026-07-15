const encoder = new TextEncoder();
// This value must remain readable by the Cloudflare Worker profile. Workerd's
// Web Crypto implementation currently caps a PBKDF2 request at 100,000 rounds.
const iterations = 100_000;

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function unbase64(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

async function passwordMaterial(password: string, authRootSecret?: string) {
  if (!authRootSecret) return encoder.encode(password);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authRootSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`password\0${password}`)),
  );
}

async function derive(material: Uint8Array, salt: Uint8Array<ArrayBuffer>, rounds: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    material.slice().buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, authRootSecret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(await passwordMaterial(password, authRootSecret), salt, iterations);
  return `pbkdf2-sha256-v2$${iterations}$${base64(salt)}$${base64(derived)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
  authRootSecret: string,
): Promise<boolean> {
  const [algorithm, roundsValue, saltValue, expectedValue] = stored.split('$');
  if (
    algorithm === undefined ||
    !['pbkdf2-sha256', 'pbkdf2-sha256-v2'].includes(algorithm) ||
    roundsValue === undefined ||
    saltValue === undefined ||
    expectedValue === undefined
  ) {
    return false;
  }
  const rounds = Number(roundsValue);
  if (!Number.isInteger(rounds) || rounds < 100_000 || rounds > 1_000_000) return false;
  const actual = await derive(
    await passwordMaterial(password, algorithm === 'pbkdf2-sha256-v2' ? authRootSecret : undefined),
    unbase64(saltValue),
    rounds,
  );
  const expected = unbase64(expectedValue);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}
