const encoder = new TextEncoder();
const iterations = 310_000;

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function unbase64(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, rounds: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${base64(salt)}$${base64(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, roundsValue, saltValue, expectedValue] = stored.split('$');
  if (
    algorithm !== 'pbkdf2-sha256' ||
    roundsValue === undefined ||
    saltValue === undefined ||
    expectedValue === undefined
  ) {
    return false;
  }
  const rounds = Number(roundsValue);
  if (!Number.isInteger(rounds) || rounds < 100_000 || rounds > 1_000_000) return false;
  const actual = await derive(password, unbase64(saltValue), rounds);
  const expected = unbase64(expectedValue);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}
