import { mkdtempSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from './bootstrap.js';

const wildcardAddresses = ['::', '::0', '0.0.0.0'];

function standaloneEnvironment(mediaRoot: string): Record<string, string> {
  // The standalone profile sets no bind address: the loopback default must apply.
  return { PORT: '0', APIARYLENS_DATABASE: ':memory:', APIARYLENS_MEDIA: mediaRoot };
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const socket = connect({ host, port, timeout: 2_000 });
    socket.once('connect', () => {
      socket.destroy();
      resolveProbe(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolveProbe(false);
    });
    socket.once('error', () => resolveProbe(false));
  });
}

function nonLoopbackAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((entry) => !entry.internal)
    .map((entry) => entry.address);
}

describe('standalone listener binding (WIN-029)', () => {
  let mediaRoot: string;
  let running: RunningServer;

  beforeAll(async () => {
    mediaRoot = mkdtempSync(join(tmpdir(), 'apiarylens-loopback-'));
    running = await startServer(standaloneEnvironment(mediaRoot));
  });

  afterAll(async () => {
    await running?.close();
    rmSync(mediaRoot, { recursive: true, force: true });
  });

  it('binds the IPv4 loopback address, never a wildcard listener', () => {
    expect(running.address).toBe('127.0.0.1');
    expect(wildcardAddresses).not.toContain(running.address);
  });

  it('serves requests over the loopback interface', async () => {
    const response = await fetch(`http://127.0.0.1:${running.port}/health`);
    expect(response.ok).toBe(true);
  });

  it('is not reachable over IPv6, proving no :: dual-stack listener', async () => {
    expect(await canConnect('::1', running.port)).toBe(false);
  });

  it(
    'refuses connections on every non-loopback interface address',
    { timeout: 15_000 },
    async () => {
      const addresses = nonLoopbackAddresses();
      const probes = await Promise.all(
        addresses.map(async (address) => ({
          address,
          reachable: await canConnect(address, running.port),
        })),
      );
      expect(probes.filter((probe) => probe.reachable)).toEqual([]);
    },
  );

  it('rejects a wildcard bind request outside production', async () => {
    await expect(
      Promise.resolve().then(() =>
        startServer({
          ...standaloneEnvironment(mediaRoot),
          APIARYLENS_BIND_ADDRESS: '0.0.0.0',
        }),
      ),
    ).rejects.toThrow('only in production mode');
  });
});
