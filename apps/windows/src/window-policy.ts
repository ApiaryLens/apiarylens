export function isTrustedRendererUrl(candidate: string, endpoint: string): boolean {
  try {
    const url = new URL(candidate);
    return url.origin === endpoint && url.protocol === 'http:' && url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * The first-run mode chooser may show exactly one packaged local page and
 * nothing else — no loopback service, no remote origin, no other file. This
 * guarantees the chooser itself performs zero network access.
 */
export function isTrustedFirstRunUrl(candidate: string, chooserPageUrl: string): boolean {
  try {
    const url = new URL(candidate);
    const expected = new URL(chooserPageUrl);
    return (
      url.protocol === 'file:' &&
      expected.protocol === 'file:' &&
      url.href === expected.href &&
      !url.search &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isTrustedConnectedRendererUrl(candidate: string, endpoint: string): boolean {
  try {
    const url = new URL(candidate);
    const expected = new URL(endpoint);
    return (
      url.origin === expected.origin && url.protocol === 'https:' && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

export function shouldInjectControlHeader(
  candidate: string,
  endpoint: string,
  webContentsId: number | undefined,
  trustedWebContents: ReadonlySet<number>,
): boolean {
  let pathname = '';
  try {
    pathname = new URL(candidate).pathname;
  } catch {
    return false;
  }
  return (
    webContentsId !== undefined &&
    trustedWebContents.has(webContentsId) &&
    isTrustedRendererUrl(candidate, endpoint) &&
    !pathname.startsWith('/__desktop/')
  );
}
