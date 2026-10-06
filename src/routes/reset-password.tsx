import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — SAVR Travels CRM" },
      { name: "description", content: "Choose a new password for your SAVR Travels staff account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [checkingLink, setCheckingLink] = useState(true);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        setValidLink(true);
        setCheckingLink(false);
      }
    });

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      const recoveryHash = window.location.hash.includes("type=recovery");
      if (data.session && recoveryHash) setValidLink(true);
      else if (sessionError) setError("This reset link is invalid or expired. Request a new one from the sign-in page.");
      setCheckingLink(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Your password has been updated. Redirecting to the dashboard…");
      window.setTimeout(() => navigate({ to: "/dashboard" }), 900);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update password. Request a fresh reset link and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <img
            src="/savr-logo.png"
            alt="SAVR Technologies - CRM solutions for a smarter tomorrow"
            className="mb-2 w-48 rounded-lg"
          />
          <CardTitle className="font-display text-xl">Set a new password</CardTitle>
          <CardDescription>Choose a new password for your staff account.</CardDescription>
        </CardHeader>
        <CardContent>
          {checkingLink ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Verifying reset link…</p>
          ) : validLink ? (
            <form onSubmit={updatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </div>
              {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div>}
              {message && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div>}
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Update password</Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error ?? "This reset link is invalid or expired. Request a new one from the sign-in page."}</span>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={() => navigate({ to: "/auth" })}>Back to sign in</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
