import { describe, expect, it } from 'vitest';
import { formatServerAddress, resolveServerBinding } from './runtime-config.js';

describe('server binding policy', () => {
  it('defaults to IPv4 loopback', () => {
    expect(resolveServerBinding({}, false)).toEqual({
      hostname: '127.0.0.1',
      networkReachable: false,
    });
  });

  it.each(['127.0.0.1', '127.10.20.30', '::1'])('allows loopback address %s', (hostname) => {
    expect(resolveServerBinding({ APIARYLENS_BIND_ADDRESS: hostname }, false)).toEqual({
      hostname,
      networkReachable: false,
    });
  });

  it.each(['localhost', 'api', 'http://127.0.0.1', ''])(
    'rejects invalid explicit address %s',
    (hostname) => {
      const environment =
        hostname === ''
          ? { APIARYLENS_BIND_ADDRESS: 'not-an-address' }
          : { APIARYLENS_BIND_ADDRESS: hostname };
      expect(() => resolveServerBinding(environment, false)).toThrow(
        'must be an explicit IPv4 or IPv6 address',
      );
    },
  );

  it('rejects a development network bind even when explicitly requested', () => {
    expect(() =>
      resolveServerBinding(
        {
          APIARYLENS_BIND_ADDRESS: '0.0.0.0',
          APIARYLENS_ALLOW_NETWORK_BIND: 'true',
          APIARYLENS_BEHIND_HTTPS_PROXY: 'true',
        },
        true,
      ),
    ).toThrow('only in production mode');
  });

  it('requires explicit network authorization, authentication, and the HTTPS proxy boundary', () => {
    const base = {
      NODE_ENV: 'production',
      APIARYLENS_BIND_ADDRESS: '0.0.0.0',
    };
    expect(() => resolveServerBinding(base, true)).toThrow('APIARYLENS_ALLOW_NETWORK_BIND=true');
    expect(() =>
      resolveServerBinding({ ...base, APIARYLENS_ALLOW_NETWORK_BIND: 'true' }, false),
    ).toThrow('requires configured authentication');
    expect(() =>
      resolveServerBinding({ ...base, APIARYLENS_ALLOW_NETWORK_BIND: 'true' }, true),
    ).toThrow('APIARYLENS_BEHIND_HTTPS_PROXY=true');
  });

  it('allows the authenticated production backend behind its HTTPS proxy', () => {
    expect(
      resolveServerBinding(
        {
          NODE_ENV: 'production',
          APIARYLENS_BIND_ADDRESS: '0.0.0.0',
          APIARYLENS_ALLOW_NETWORK_BIND: 'true',
          APIARYLENS_BEHIND_HTTPS_PROXY: 'true',
        },
        true,
      ),
    ).toEqual({ hostname: '0.0.0.0', networkReachable: true });
  });

  it('formats IPv4 and IPv6 listener addresses safely', () => {
    expect(formatServerAddress('127.0.0.1', 3000)).toBe('http://127.0.0.1:3000');
    expect(formatServerAddress('::1', 3000)).toBe('http://[::1]:3000');
  });
});
