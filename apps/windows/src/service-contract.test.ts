import { describe, expect, it } from 'vitest';
import { parseServiceReadiness, safeTokenEqual } from './service-contract.js';

describe('desktop service contract', () => {
  it('accepts only readiness owned by the expected process on IPv4 loopback', () => {
    expect(
      parseServiceReadiness(
        { pid: 42, address: '127.0.0.1', port: 49_152, serviceProtocolVersion: 1 },
        42,
      ),
    ).toEqual({ pid: 42, address: '127.0.0.1', port: 49_152, serviceProtocolVersion: 1 });
    expect(() =>
      parseServiceReadiness(
        { pid: 43, address: '127.0.0.1', port: 49_152, serviceProtocolVersion: 1 },
        42,
      ),
    ).toThrow('owner');
    expect(() =>
      parseServiceReadiness(
        { pid: 42, address: '0.0.0.0', port: 49_152, serviceProtocolVersion: 1 },
        42,
      ),
    ).toThrow('IPv4 loopback');
    expect(() =>
      parseServiceReadiness(
        { pid: 42, address: '127.0.0.1', port: 49_152, serviceProtocolVersion: 2 },
        42,
      ),
    ).toThrow('incompatible');
  });

  it('compares control tokens without accepting prefixes or suffixes', () => {
    expect(safeTokenEqual('a'.repeat(43), 'a'.repeat(43))).toBe(true);
    expect(safeTokenEqual('a'.repeat(43), 'a'.repeat(42))).toBe(false);
    expect(safeTokenEqual('a'.repeat(43), `${'a'.repeat(42)}b`)).toBe(false);
  });
});
