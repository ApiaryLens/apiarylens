import { describe, expect, it } from 'vitest';
import {
  isTrustedConnectedRendererUrl,
  isTrustedFirstRunUrl,
  isTrustedRendererUrl,
  shouldInjectControlHeader,
} from './window-policy.js';

describe('Windows renderer boundary', () => {
  const endpoint = 'http://127.0.0.1:49152';

  it('trusts only the exact loopback service origin', () => {
    expect(isTrustedRendererUrl(`${endpoint}/api/v1/session`, endpoint)).toBe(true);
    expect(isTrustedRendererUrl('http://127.0.0.1:49153/', endpoint)).toBe(false);
    expect(isTrustedRendererUrl('http://[::1]:49152/', endpoint)).toBe(false);
    expect(isTrustedRendererUrl('https://apiarylens.example/', endpoint)).toBe(false);
    expect(isTrustedRendererUrl('data:text/html,untrusted', endpoint)).toBe(false);
  });

  it('allows only the imported connected HTTPS origin', () => {
    const connected = 'https://hives.example.test';
    expect(isTrustedConnectedRendererUrl(`${connected}/app`, connected)).toBe(true);
    expect(isTrustedConnectedRendererUrl('https://evil.example.test/app', connected)).toBe(false);
    expect(isTrustedConnectedRendererUrl('http://hives.example.test/app', connected)).toBe(false);
    const credentialedOrigin = new URL(connected);
    credentialedOrigin.username = 'user';
    credentialedOrigin.password = 'secret';
    expect(isTrustedConnectedRendererUrl(credentialedOrigin.href, connected)).toBe(false);
  });

  it('confines the first-run chooser to its exact packaged page', () => {
    const chooser = 'file:///C:/Program%20Files/ApiaryLens/resources/dist/first-run.html';
    expect(isTrustedFirstRunUrl(chooser, chooser)).toBe(true);
    expect(isTrustedFirstRunUrl(`${chooser}#detail`, chooser)).toBe(false);
    expect(isTrustedFirstRunUrl(`${chooser}?next=1`, chooser)).toBe(false);
    expect(isTrustedFirstRunUrl('file:///C:/other/page.html', chooser)).toBe(false);
    expect(isTrustedFirstRunUrl(endpoint, chooser)).toBe(false);
    expect(isTrustedFirstRunUrl('https://apiarylens.example/', chooser)).toBe(false);
    expect(isTrustedFirstRunUrl('data:text/html,untrusted', chooser)).toBe(false);
    expect(isTrustedFirstRunUrl(chooser, endpoint)).toBe(false);
  });

  it('injects process authority only for a registered trusted webContents', () => {
    const trusted = new Set([7]);
    expect(shouldInjectControlHeader(`${endpoint}/`, endpoint, 7, trusted)).toBe(true);
    expect(shouldInjectControlHeader(`${endpoint}/`, endpoint, 8, trusted)).toBe(false);
    expect(shouldInjectControlHeader('http://127.0.0.1:49153/', endpoint, 7, trusted)).toBe(false);
    expect(shouldInjectControlHeader(`${endpoint}/`, endpoint, undefined, trusted)).toBe(false);
    expect(shouldInjectControlHeader(`${endpoint}/__desktop/shutdown`, endpoint, 7, trusted)).toBe(
      false,
    );
  });
});
