import { timingSafeEqual } from 'node:crypto';

export const desktopControlHeader = 'x-apiarylens-desktop-control';

export type ServiceReadiness = {
  pid: number;
  address: '127.0.0.1';
  port: number;
  serviceProtocolVersion: number;
};

export function parseServiceReadiness(value: unknown, expectedPid: number): ServiceReadiness {
  if (!value || typeof value !== 'object') throw new Error('Service readiness is not an object');
  const candidate = value as Partial<ServiceReadiness>;
  if (candidate.pid !== expectedPid) throw new Error('Service readiness owner does not match');
  if (candidate.address !== '127.0.0.1') throw new Error('Service did not bind to IPv4 loopback');
  if (
    !Number.isSafeInteger(candidate.port) ||
    Number(candidate.port) < 1 ||
    Number(candidate.port) > 65_535
  ) {
    throw new Error('Service readiness port is invalid');
  }
  if (candidate.serviceProtocolVersion !== 1) {
    throw new Error('Service protocol is incompatible with this Windows host');
  }
  return candidate as ServiceReadiness;
}

export function safeTokenEqual(expected: string, presented: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const presentedBytes = Buffer.from(presented, 'utf8');
  return (
    expectedBytes.length === presentedBytes.length && timingSafeEqual(expectedBytes, presentedBytes)
  );
}
