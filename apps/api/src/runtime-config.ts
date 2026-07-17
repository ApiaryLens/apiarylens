import { isIP } from 'node:net';

export type ServerBinding = {
  hostname: string;
  networkReachable: boolean;
};

function isLoopbackAddress(hostname: string): boolean {
  if (hostname === '::1') return true;
  if (isIP(hostname) !== 4) return false;
  const [firstOctet] = hostname.split('.');
  return firstOctet === '127';
}

export function resolveServerBinding(
  environment: Readonly<Record<string, string | undefined>>,
  authenticationConfigured: boolean,
): ServerBinding {
  const hostname = environment.APIARYLENS_BIND_ADDRESS?.trim() || '127.0.0.1';
  if (isIP(hostname) === 0) {
    throw new Error('APIARYLENS_BIND_ADDRESS must be an explicit IPv4 or IPv6 address');
  }

  if (isLoopbackAddress(hostname)) {
    return { hostname, networkReachable: false };
  }

  if (environment.NODE_ENV !== 'production') {
    throw new Error('A network-reachable API bind is supported only in production mode');
  }
  if (environment.APIARYLENS_ALLOW_NETWORK_BIND !== 'true') {
    throw new Error('A network-reachable API bind requires APIARYLENS_ALLOW_NETWORK_BIND=true');
  }
  if (!authenticationConfigured) {
    throw new Error('A network-reachable API bind requires configured authentication');
  }
  if (environment.APIARYLENS_BEHIND_HTTPS_PROXY !== 'true') {
    throw new Error('A network-reachable API bind requires APIARYLENS_BEHIND_HTTPS_PROXY=true');
  }

  return { hostname, networkReachable: true };
}

export function formatServerAddress(hostname: string, port: number): string {
  return `http://${hostname.includes(':') ? `[${hostname}]` : hostname}:${port}`;
}
