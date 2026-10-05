export function resolveRequestOrigin(request: Pick<Request, 'headers' | 'url'>): string | null {
  const originHeader = request.headers.get('origin');
  if (originHeader && isHttpOrigin(originHeader)) {
    return originHeader;
  }

  const refererHeader = request.headers.get('referer');
  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      if (isHttpOrigin(refererUrl.origin)) {
        return refererUrl.origin;
      }
    } catch {
      // Ignore invalid referrers and fall back to the current request origin.
    }
  }

  try {
    const requestUrl = new URL(request.url);
    if (isHttpOrigin(requestUrl.origin)) {
      return requestUrl.origin;
    }
  } catch {
    // Ignore invalid request URLs.
  }

  return null;
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === value &&
      !url.username &&
      !url.password &&
      ['http:', 'https:'].includes(url.protocol)
    );
  } catch {
    return false;
  }
}
