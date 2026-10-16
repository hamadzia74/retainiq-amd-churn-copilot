import { useMutation, useQuery } from "@tanstack/react-query";
import { LogIn, Sparkles, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { authConfigQuery } from "../../api/queries";
import type { Me } from "../../api/types";
import { Logo } from "../../components/layout/Logo";
import { Button, ErrorState, Notice, Spinner, TextField } from "../../components/ui";
import { fadeUp } from "../../motion/variants";
import { ThemeToggle } from "../../theme/ThemeToggle";
import { useSignedIn } from "./useAuth";

type Mode = "signin" | "signup";

/** Inside another site's frame (e.g. the huggingface.co Space page) browsers block sign-in cookies. */
function isEmbedded() {
  try {
    return window.self !== window.top;
  } catch {
    return true;                       // a cross-origin parent: definitely embedded
  }
}

/** Sign in (or, when the server allows it, create an account). A one-click demo when enabled. */
export function LoginPage() {
  const signedIn = useSignedIn();
  const { data: config } = useQuery(authConfigQuery());
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const submit = useMutation({
    mutationFn: (): Promise<Me> => (mode === "signin" ? api.login(email, password) : api.signup(email, name, password)),
    onSuccess: signedIn,
  });
  const demo = useMutation({ mutationFn: api.demoLogin, onSuccess: signedIn });
  const busy = submit.isPending || demo.isPending;
  const error = submit.error ?? demo.error;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) submit.mutate();
  };
  const switchMode = (m: Mode) => {
    setMode(m);
    submit.reset();
  };

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <div className="flex justify-end p-3"><ThemeToggle className="w-32" /></div>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="w-full max-w-sm">
          <div className="mb-6 flex justify-center"><Logo /></div>

          {isEmbedded() && (
            <Notice className="mb-4">
              This page is shown inside another site, where your browser blocks sign-in.{" "}
              <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                Open RetainIQ in a new tab
              </a>
            </Notice>
          )}

          <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
            <h1 className="text-lg font-semibold text-strong">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
            <p className="mt-1 text-sm text-muted">
              {mode === "signin" ? "Churn prevention for your store, powered by AMD." : "You'll join as an analyst."}
            </p>

            <form onSubmit={onSubmit} className="mt-5 space-y-3.5">
              {mode === "signup" && (
                <TextField label="Your name" autoComplete="name" required maxLength={80}
                  value={name} onChange={(e) => setName(e.target.value)} />
              )}
              <TextField label="Email" type="email" autoComplete="email" required autoFocus maxLength={254}
                value={email} onChange={(e) => setEmail(e.target.value)} />
              <TextField label="Password" type="password" required maxLength={200}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={mode === "signup" ? 8 : undefined}
                hint={mode === "signup" ? "At least 8 characters." : undefined}
                value={password} onChange={(e) => setPassword(e.target.value)} />

              {error && <ErrorState error={error} />}

              <Button type="submit" disabled={busy} className="w-full">
                {submit.isPending ? <Spinner className="h-4 w-4" />
                  : mode === "signin" ? <LogIn size={15} strokeWidth={2} /> : <UserPlus size={15} strokeWidth={2} />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            {config?.demo && mode === "signin" && (
              <>
                <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wide text-subtle">
                  <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                </div>
                <Button variant="ghost" disabled={busy} onClick={() => demo.mutate()} className="w-full">
                  {demo.isPending ? <Spinner className="h-4 w-4" /> : <Sparkles size={15} strokeWidth={2} />}
                  Try the demo
                </Button>
                <p className="mt-2 text-center text-[11px] text-subtle">A shared account with a small daily AI allowance.</p>
              </>
            )}
          </section>

          <p className="mt-4 text-center text-xs text-muted">
            {mode === "signin"
              ? config?.signup
                ? <>New here? <button type="button" onClick={() => switchMode("signup")} className="font-medium text-amd-fg hover:underline">Create an account</button></>
                : "Need an account? Ask your RetainIQ admin."
              : <>Already have an account? <button type="button" onClick={() => switchMode("signin")} className="font-medium text-amd-fg hover:underline">Sign in</button></>}
          </p>
        </motion.div>
      </main>
    </div>
  );
}
