export function isTrustedRendererUrl(candidate: string, endpoint: string): boolean {
  try {
    const url = new URL(candidate);
    return url.origin === endpoint && url.protocol === 'http:' && url.hostname === '127.0.0.1';
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
