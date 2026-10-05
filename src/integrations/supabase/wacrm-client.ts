import { createClient } from '@supabase/supabase-js';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createWacrmSupabaseClient() {
  const WACRM_SUPABASE_URL =
    import.meta.env['VITE_WACRM_SUPABASE_URL'] ||
    import.meta.env['VITE_SUPABASE_URL'] ||
    process.env['WACRM_SUPABASE_URL'] ||
    process.env['SUPABASE_URL'];

  const WACRM_SUPABASE_ANON_KEY =
    import.meta.env['VITE_WACRM_SUPABASE_ANON_KEY'] ||
    import.meta.env['VITE_WACRM_PUBLISHABLE_KEY'] ||
    import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ||
    process.env['WACRM_SUPABASE_ANON_KEY'] ||
    process.env['WACRM_SUPABASE_PUBLISHABLE_KEY'] ||
    process.env['SUPABASE_PUBLISHABLE_KEY'];

  if (!WACRM_SUPABASE_URL || !WACRM_SUPABASE_ANON_KEY) {
    const missing = [
      ...(!WACRM_SUPABASE_URL ? ['WACRM_SUPABASE_URL'] : []),
      ...(!WACRM_SUPABASE_ANON_KEY ? ['WACRM_SUPABASE_ANON_KEY'] : []),
    ];
    console.warn(`[WACRM Supabase] Missing environment variable(s): ${missing.join(', ')}`);
    return createClient<any>(
      'https://placeholder.supabase.co',
      'placeholder-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  }

  return createClient<any>(WACRM_SUPABASE_URL, WACRM_SUPABASE_ANON_KEY, {
    global: {
      fetch: createSupabaseFetch(WACRM_SUPABASE_ANON_KEY),
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export const wacrmSupabase = createWacrmSupabaseClient();
