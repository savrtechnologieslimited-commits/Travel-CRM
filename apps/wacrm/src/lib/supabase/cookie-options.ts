// WACRM runs inside a cross-site CRM iframe, so its auth cookies must be
// permitted and partitioned for that embedding site.
export const WACRM_AUTH_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'none',
  secure: true,
  partitioned: true,
} as const;
