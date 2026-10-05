export function resolveWacrmAppUrl(
  configuredUrl: string | undefined,
  isDevelopment: boolean,
): URL | null {
  const candidate = configuredUrl || (isDevelopment ? "http://localhost:3000" : "");
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
