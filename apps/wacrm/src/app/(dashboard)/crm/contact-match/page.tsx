'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type MatchedConversation = {
  id: string;
  status: string;
  last_message_at: string | null;
};

type MatchedContact = {
  id: string;
  name: string | null;
  phone: string;
  conversations: MatchedConversation[];
};

type MatchResponse = {
  status: 'matched' | 'ambiguous' | 'unmatched';
  candidates: MatchedContact[];
};

function ContactMatchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const issuer = searchParams.get('issuer');
  const [matches, setMatches] = useState<MatchedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const submittedToken = useRef<string | null>(null);
  const missingLinkError =
    !token || !issuer
      ? 'The CRM matching link is incomplete. Return to the CRM and try again.'
      : null;

  useEffect(() => {
    if (!token || !issuer) return;
    if (submittedToken.current === token) return;
    submittedToken.current = token;

    window.history.replaceState({}, '', '/crm/contact-match');

    void fetch('/api/crm/contact-match', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-crm-origin': issuer,
      },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message =
            body &&
            typeof body === 'object' &&
            'error' in body &&
            typeof body.error === 'string'
              ? body.error
              : 'WACRM could not match this phone number.';
          throw new Error(message);
        }
        return body as MatchResponse;
      })
      .then((result) => {
        setMatches(result.candidates);
        if (result.candidates.length === 0) {
          router.replace('/inbox');
          return;
        }
        if (
          result.candidates.length === 1 &&
          result.candidates[0]?.conversations.length === 0
        ) {
          router.replace('/inbox');
          return;
        }
        if (result.candidates.length === 1 && result.candidates[0]?.conversations[0]) {
          router.replace(
            `/inbox?c=${encodeURIComponent(result.candidates[0].conversations[0].id)}`
          );
        }
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : 'WACRM contact matching failed.'
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [issuer, router, token]);

  function openContact(
    contact: MatchedContact,
    conversation?: MatchedConversation
  ) {
    if (conversation) {
      router.push(`/inbox?c=${encodeURIComponent(conversation.id)}`);
    } else {
      router.push(`/contacts?contact=${encodeURIComponent(contact.id)}`);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-5 py-10">
      <section className="border-border bg-card rounded-xl border p-6 shadow-sm">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          CRM contact match
        </p>
        <h1 className="mt-2 text-2xl font-semibold">
          Find the WACRM conversation
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Matching uses the exact phone number within your currently signed-in
          WACRM account.
        </p>

        {loading && token && issuer && (
          <p className="text-muted-foreground mt-6 text-sm">
            Checking contacts…
          </p>
        )}
        {(error || missingLinkError) && (
          <p
            className="bg-destructive/10 text-destructive mt-6 rounded-md p-3 text-sm"
            role="alert"
          >
            {error || missingLinkError}
          </p>
        )}
        {!loading && !error && !missingLinkError && matches.length > 0 && (
          <div className="mt-6 space-y-4">
            {matches.length > 1 && (
              <p className="text-sm text-amber-700">
                Multiple WACRM contacts match this number. Choose the correct
                contact and conversation.
              </p>
            )}
            {matches.map((contact) => (
              <article
                key={contact.id}
                className="border-border rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-medium">
                      {contact.name || 'Unnamed WACRM contact'}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {contact.phone}
                    </p>
                  </div>
                  {contact.conversations.length === 0 && (
                    <button
                      type="button"
                      onClick={() => openContact(contact)}
                      className="border-border hover:bg-muted rounded-md border px-3 py-2 text-sm font-medium"
                    >
                      Open contact
                    </button>
                  )}
                </div>
                {contact.conversations.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {contact.conversations.map((conversation, index) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => openContact(contact, conversation)}
                        className="border-border hover:bg-muted flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm"
                      >
                        <span>
                          {contact.conversations.length > 1
                            ? `Conversation ${index + 1}`
                            : 'Open conversation'}
                        </span>
                        <span className="text-muted-foreground">
                          {conversation.status}
                          {conversation.last_message_at
                            ? ` · ${new Date(conversation.last_message_at).toLocaleString()}`
                            : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function ContactMatchPage() {
  return (
    <Suspense
      fallback={
        <main className="text-muted-foreground p-8 text-sm">
          Loading contact match…
        </main>
      }
    >
      <ContactMatchPageInner />
    </Suspense>
  );
}
