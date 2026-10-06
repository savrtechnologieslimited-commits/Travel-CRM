import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { WACRM_AUTH_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: WACRM_AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  };

  const standaloneAuthPaths = [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/join',
  ];
  const isStandaloneAuthPage = standaloneAuthPaths.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`)
  );

  // WACRM accounts are established by the CRM bridge. Keep the legacy
  // auth endpoints out of the standalone UI so staff are not prompted
  // to sign in a second time.
  if (isStandaloneAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  if (isStandaloneAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/access-required';
    url.search = '';
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  // Protected pages - require the CRM's secure sign-in bridge.
  // Every top-level route under src/app/(dashboard)/ belongs here —
  // middleware.test.ts reads that directory and fails on a missing one.
  const protectedPaths = [
    '/dashboard',
    '/inbox',
    '/contacts',
    '/pipelines',
    '/broadcasts',
    '/automations',
    '/flows',
    '/agents',
    '/notifications',
    '/settings',
    '/crm/contact-match',
  ];
  if (
    !user &&
    protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/access-required';
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  // API routes that need auth (not webhooks)
  if (
    !user &&
    request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
    !request.nextUrl.pathname.includes('/webhook')
  ) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
