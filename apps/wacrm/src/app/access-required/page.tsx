import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Open WACRM from your Travel CRM',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function AccessRequiredPage() {
  return (
    <main className="bg-background flex min-h-screen items-center justify-center px-4">
      <section className="border-border bg-card w-full max-w-md rounded-xl border p-6 text-center shadow-sm">
        <h1 className="text-foreground text-xl font-semibold">
          Open WACRM from your Travel CRM
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          WACRM is connected to your company’s Travel CRM. Sign in to the CRM
          and open WhatsApp there to continue. You will be securely connected
          automatically; a separate WACRM login is not needed.
        </p>
      </section>
    </main>
  );
}
