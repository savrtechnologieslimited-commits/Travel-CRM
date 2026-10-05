import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Globe2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithLoginIdFn } from "@/lib/team-members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Staff Sign In — SAVR Travels CRM" },
      {
        name: "description",
        content:
          "Secure sign-in for SAVR Travels staff to manage leads, enquiries, bookings and travel operations.",
      },
      { property: "og:title", content: "Staff Sign In — SAVR Travels CRM" },
      {
        property: "og:description",
        content: "Secure sign-in for the SAVR Travels travel operations platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    const rememberedLogin = window.localStorage.getItem("savr-remembered-login");
    if (rememberedLogin) {
      setLoginId(rememberedLogin);
      setRememberLogin(true);
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSignInError(null);
    try {
      const tokens = await signInWithLoginIdFn({ data: { identifier: loginId, password } });
      const { error } = await supabase.auth.setSession(tokens);
      if (error) throw error;
      if (rememberLogin) {
        window.localStorage.setItem("savr-remembered-login", loginId.trim());
      } else {
        window.localStorage.removeItem("savr-remembered-login");
      }
      navigate({ to: "/dashboard" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      setSignInError(
        /invalid login id or password|invalid.*credentials|invalid.*email|invalid.*password/i.test(message)
          ? "Wrong username or password. Check your credentials and try again."
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendRecoveryEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecoveryLoading(true);
    setRecoveryError(null);
    setRecoveryMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setRecoveryMessage("If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.");
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "Unable to send a password reset email.");
    } finally {
      setRecoveryLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[#f4f7f6] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#073b3b] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -top-36 -left-32 size-[30rem] rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute -right-40 -bottom-44 size-[34rem] rounded-full bg-amber-300/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-amber-400 text-[#073b3b] shadow-lg shadow-black/10">
            <Globe2 className="size-6" />
          </div>
          <div>
            <p className="font-display text-lg font-bold tracking-tight">SAVR Travels</p>
            <p className="text-xs text-teal-100/70">Travel Operations OS</p>
          </div>
        </div>
        <div className="relative max-w-xl py-16">
          <p className="mb-5 text-xs font-semibold tracking-[0.24em] text-amber-300 uppercase">Staff workspace</p>
          <h1 className="font-display text-5xl leading-[1.08] font-semibold tracking-tight xl:text-6xl">
            Make every journey feel effortless.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-teal-50/75">
            One calm workspace for enquiries, itineraries, supplier coordination, bookings and the details that make every trip memorable.
          </p>
          <div className="mt-10 flex flex-wrap gap-2">
            {["Leads", "Itineraries", "Bookings", "Operations"].map((item) => (
              <span key={item} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-teal-50/85">{item}</span>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-teal-100/55">Thoughtfully planned travel. Seamlessly managed.</p>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-teal-100/70 blur-3xl" />
        <Card className="relative w-full max-w-[440px] rounded-3xl border-white/80 bg-white/95 p-1 shadow-[0_24px_80px_-36px_rgba(7,59,59,0.28)] backdrop-blur">
          <CardHeader className="px-7 pt-8 pb-2 sm:px-9 sm:pt-10">
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <div className="grid size-11 place-items-center rounded-xl bg-[#073b3b] text-amber-300"><Globe2 className="size-5" /></div>
              <div>
                <p className="font-display font-bold text-[#073b3b]">SAVR Travels</p>
                <p className="text-xs text-muted-foreground">Travel Operations OS</p>
              </div>
            </div>
            <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase">Welcome back</p>
            <CardTitle className="font-display text-3xl font-semibold tracking-tight text-slate-900">
              {forgotPassword ? "Reset password" : "Sign in to SAVR"}
            </CardTitle>
            <CardDescription className="mt-2 text-sm leading-6 text-slate-500">
              {forgotPassword ? "Enter your staff account email and we’ll send a secure reset link." : "Use your staff login ID or work email to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-7 pt-5 pb-8 sm:px-9 sm:pb-10">
            {forgotPassword ? (
              <form onSubmit={sendRecoveryEmail} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="recovery-email" className="text-slate-700">Account email</Label>
                  <Input id="recovery-email" type="email" required autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="name@example.com" className="h-12 rounded-xl border-slate-200 bg-slate-50/70 px-4 focus-visible:ring-teal-700" />
                </div>
                {recoveryError && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{recoveryError}</div>}
                {recoveryMessage && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{recoveryMessage}</div>}
                <Button type="submit" className="h-12 w-full rounded-xl bg-[#087b78] text-base font-semibold shadow-sm hover:bg-[#066a67]" disabled={recoveryLoading}>
                  {recoveryLoading && <Loader2 className="mr-2 size-4 animate-spin" />}Send reset link
                </Button>
                <Button type="button" variant="ghost" className="w-full text-slate-600" onClick={() => { setForgotPassword(false); setRecoveryError(null); setRecoveryMessage(null); }}>
                  <ArrowLeft className="mr-2 size-4" /> Back to sign in
                </Button>
              </form>
            ) : (
              <form onSubmit={signIn} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-id" className="text-slate-700">Login ID or email</Label>
                  <Input id="login-id" type="text" required autoComplete="username" value={loginId} onChange={(event) => { setLoginId(event.target.value); setSignInError(null); }} placeholder="Your login ID or work email" className="h-12 rounded-xl border-slate-200 bg-slate-50/70 px-4 focus-visible:ring-teal-700" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="password" className="text-slate-700">Password</Label>
                    <button type="button" className="text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline" onClick={() => { setRecoveryEmail(loginId.includes("@") ? loginId : ""); setForgotPassword(true); setSignInError(null); }}>Forgot password?</button>
                  </div>
                  <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setSignInError(null); }} className="h-12 rounded-xl border-slate-200 bg-slate-50/70 px-4 focus-visible:ring-teal-700" />
                </div>
                <label htmlFor="remember-login" className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-500">
                  <input id="remember-login" type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} className="size-4 rounded border-slate-300 accent-teal-700" />
                  Remember my login ID on this device
                </label>
                {signInError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{signInError}</span></div>}
                <Button type="submit" className="h-12 w-full rounded-xl bg-[#087b78] text-base font-semibold shadow-sm hover:bg-[#066a67]" disabled={loading}>
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}Continue to workspace
                </Button>
                <p className="pt-1 text-center text-xs text-slate-400">Secure access for SAVR Travels team members</p>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
