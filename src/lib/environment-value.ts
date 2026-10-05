export function cleanEnvironmentValue(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/(?:\\r\\n|\\r|\\n)+$/g, "").trim();
  return cleaned || undefined;
}
