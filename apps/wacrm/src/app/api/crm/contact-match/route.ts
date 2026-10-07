import { NextResponse, type NextRequest } from 'next/server';

import { supabaseAdmin } from '@/lib/ai/admin-client';
import {
  BridgeConfigurationError,
  InvalidBridgeTokenError,
  verifyWacrmBridgeToken,
} from '@/lib/auth/bridge-token';
import { consumeBridgeNonce } from '@/lib/auth/consume-bridge-nonce';
import { resolveCrmContactMatch } from '@/lib/contacts/crm-contact-match';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowedOrigin = process.env.CRM_ORIGIN;
  if (
    !origin ||
    !allowedOrigin ||
    allowedOrigin === '*' ||
    origin !== allowedOrigin
  ) {
    return {};
  }
  return {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type, x-crm-origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function matchError(request: NextRequest, message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store', ...getCorsHeaders(request) },
    }
  );
}

export async function OPTIONS(request: NextRequest) {
  const headers = getCorsHeaders(request);
  if (!headers['Access-Control-Allow-Origin']) {
    return new NextResponse(null, {
      status: 403,
      headers: { 'Cache-Control': 'no-store', Vary: 'Origin' },
    });
  }
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request);
  const contentLength = request.headers.get('content-length');
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > 8192)
  ) {
    return matchError(
      request,
      'The CRM contact-match request is too large.',
      413
    );
  }

  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    return matchError(request, 'Expected a JSON contact-match request.', 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return matchError(
      request,
      'The CRM contact-match request is invalid.',
      400
    );
  }
  if (!body || typeof body !== 'object' || !('token' in body)) {
    return matchError(request, 'The CRM contact-match token is missing.', 400);
  }
  const token = body.token;
  if (typeof token !== 'string' || !token) {
    return matchError(request, 'The CRM contact-match token is missing.', 400);
  }

  let claims;
  try {
    claims = verifyWacrmBridgeToken(
      token,
      process.env.WACRM_BRIDGE_SECRET ?? '',
      request.headers.get('x-crm-origin') ?? request.headers.get('origin'),
      new URL(request.url).origin
    );
  } catch (error) {
    if (error instanceof InvalidBridgeTokenError) {
      return matchError(request, error.message, 401);
    }
    if (error instanceof BridgeConfigurationError) {
      console.error(
        '[POST /api/crm/contact-match] bridge secret is not configured.'
      );
      return matchError(
        request,
        'WACRM contact matching is not configured.',
        503
      );
    }
    throw error;
  }
  if (claims.purpose !== 'contact-match' || !claims.record) {
    return matchError(
      request,
      'This token cannot be used for contact matching.',
      401
    );
  }
  if (
    request.headers.get('origin') !== new URL(request.url).origin &&
    !corsHeaders['Access-Control-Allow-Origin']
  ) {
    return matchError(
      request,
      'This CRM origin is not allowed to read WACRM messages.',
      403
    );
  }

  const admin = supabaseAdmin();
  const sessionClient = await createClient();
  const {
    data: { user: activeWacrmUser },
    error: sessionError,
  } = await sessionClient.auth.getUser();
  const requiresActiveWacrmSession = request.headers.has('x-crm-origin');
  if (requiresActiveWacrmSession && (sessionError || !activeWacrmUser)) {
    return matchError(
      request,
      'Sign in to the WACRM account that contains this conversation, then retry.',
      401
    );
  }
  const nonceResult = await consumeBridgeNonce(
    admin,
    claims.nonce,
    claims.expiresAt
  );
  if (!nonceResult.ok && nonceResult.reason === 'database-error') {
    console.error(
      '[POST /api/crm/contact-match] failed to consume contact-match nonce:',
      nonceResult.error
    );
    return matchError(
      request,
      'WACRM could not complete contact matching.',
      500
    );
  }
  if (!nonceResult.ok) {
    return matchError(
      request,
      'This CRM contact-match request has already been used.',
      401
    );
  }

  let profileQuery = admin
    .from('profiles')
    .select('user_id, account_id')
    .eq('email', claims.email);
  if (activeWacrmUser) {
    profileQuery = admin
      .from('profiles')
      .select('user_id, account_id')
      .eq('user_id', activeWacrmUser.id);
  }
  const { data: profile, error: profileError } =
    await profileQuery.maybeSingle();
  if (profileError) {
    console.error(
      '[POST /api/crm/contact-match] failed to resolve WACRM account:',
      profileError
    );
    return matchError(
      request,
      'WACRM could not complete contact matching.',
      500
    );
  }
  if (!profile?.account_id) {
    return matchError(
      request,
      'Sign in to WACRM once before matching contacts.',
      409
    );
  }

  const record = claims.record;
  const email = record.email?.trim().toLowerCase() ?? '';
  const phones = [...new Set(record.phones)];
  const [emailResult, phoneResult] = await Promise.all([
    !activeWacrmUser && email
      ? admin
          .from('contacts')
          .select('id,name,phone')
          .eq('account_id', profile.account_id)
          .eq('email_normalized', email)
      : Promise.resolve({ data: [], error: null }),
    phones.length
      ? admin
          .from('contacts')
          .select('id,name,phone')
          .eq('account_id', profile.account_id)
          .in('phone_normalized', phones)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (emailResult.error || phoneResult.error) {
    console.error(
      '[POST /api/crm/contact-match] failed to look up WACRM contacts:',
      emailResult.error ?? phoneResult.error
    );
    return matchError(
      request,
      'WACRM could not complete contact matching.',
      500
    );
  }

  const emailContacts = emailResult.data ?? [];
  const phoneContacts = phoneResult.data ?? [];
  const candidates = new Map(
    [...emailContacts, ...phoneContacts].map((contact) => [contact.id, contact])
  );
  const candidateIds = [...candidates.keys()];
  const { data: conversations, error: conversationsError } = candidateIds.length
    ? await admin
        .from('conversations')
        .select('id,contact_id,status,last_message_at')
        .eq('account_id', profile.account_id)
        .in('contact_id', candidateIds)
        .order('last_message_at', { ascending: false, nullsFirst: false })
    : { data: [], error: null };
  if (conversationsError) {
    console.error(
      '[POST /api/crm/contact-match] failed to look up matching conversations:',
      conversationsError
    );
    return matchError(
      request,
      'WACRM could not complete contact matching.',
      500
    );
  }

  const conversationsByContact = new Map<string, typeof conversations>();
  for (const conversation of conversations ?? []) {
    const existing = conversationsByContact.get(conversation.contact_id) ?? [];
    existing.push(conversation);
    conversationsByContact.set(conversation.contact_id, existing);
  }
  const latestConversations = [...candidates.values()]
    .map((contact) => conversationsByContact.get(contact.id)?.[0])
    .filter((conversation) => conversation !== undefined);
  const messageResults = await Promise.all(
    latestConversations.map(async (conversation) => ({
      conversationId: conversation.id,
      ...(await admin
        .from('messages')
        .select(
          'id,conversation_id,sender_type,content_type,content_text,media_url,template_name,status,created_at'
        )
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(1000)),
    }))
  );
  const failedMessageResult = messageResults.find((result) => result.error);
  if (failedMessageResult?.error) {
    console.error(
      '[POST /api/crm/contact-match] failed to load matched conversation messages:',
      failedMessageResult.error
    );
    return matchError(
      request,
      'WACRM could not load the matching conversation.',
      500
    );
  }

  return NextResponse.json(
    {
      userId: profile.user_id,
      ...resolveCrmContactMatch(
        emailContacts.map((contact) => contact.id),
        phoneContacts.map((contact) => contact.id)
      ),
      candidates: [...candidates.values()].map((contact) => ({
        ...contact,
        conversations:
          conversationsByContact.get(contact.id)?.slice(0, 1) ?? [],
      })),
      messages: messageResults.flatMap((result) =>
        (result.data ?? []).reverse()
      ),
      historyMayBeLimitedConversationIds: messageResults
        .filter((result) => (result.data ?? []).length === 1000)
        .map((result) => result.conversationId),
    },
    { headers: { 'Cache-Control': 'no-store', ...corsHeaders } }
  );
}
