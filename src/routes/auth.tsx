import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Crosshair, Mail, Lock, User as UserIcon, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Force One — Sign in" },
      { name: "description", content: "Войди в Force One — тактический FPS с прокачкой и онлайн-матчами." },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Введи корректный email").max(255);
const passwordSchema = z.string().min(6, "Минимум 6 символов").max(72);
const usernameSchema = z.string().trim().min(3, "Минимум 3 символа").max(24).regex(/^[A-Za-z0-9_]+$/, "Только латиница, цифры и _");

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/" });
    });

    // Redirect if already signed in. This also catches the session created after
    // Supabase exchanges the Google OAuth code on the callback URL.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
      if (mode === "signup") usernameSchema.parse(username);
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? "Проверь данные");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: signErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username },
          },
        });
        if (signErr) throw signErr;
      } else {
        const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signErr) throw signErr;
      }
      navigate({ to: "/" });
    } catch (err: any) {
      setError(err?.message ?? "Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });
      if (signErr) throw signErr;
    } catch (err: any) {
      setError(err?.message ?? "Не удалось войти через Google");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-60 -left-40 w-[700px] h-[700px] rounded-full bg-primary/12 blur-[120px]" />
        <div className="absolute -bottom-60 -right-40 w-[700px] h-[700px] rounded-full bg-[var(--neon)]/10 blur-[140px]" />
      </div>

      <div className="relative w-full max-w-md">
        <Link to="/" className="flex items-center gap-3 mb-8 justify-center">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rotate-45 border-2 border-primary border-glow-primary" />
            <div className="absolute inset-1.5 rotate-45 border border-[var(--neon)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Crosshair className="w-4 h-4 text-[var(--neon)]" />
            </div>
          </div>
          <div className="text-xl font-black tracking-[0.25em]">
            <span className="text-foreground">FORCE</span>
            <span className="text-primary text-glow-primary">ONE</span>
          </div>
        </Link>

        <div className="bg-card/70 backdrop-blur border border-border clip-corner p-8">
          <div className="flex gap-1 mb-6 p-1 border border-border bg-secondary/40 rounded-sm">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>

          <button
            onClick={handleGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 py-2.5 mb-4 border border-border bg-background hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            <span className="text-sm font-bold uppercase tracking-wider">Войти через Google</span>
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">или</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            {mode === "signup" && (
              <Field icon={<UserIcon className="w-4 h-4" />} placeholder="Никнейм" value={username} onChange={setUsername} />
            )}
            <Field icon={<Mail className="w-4 h-4" />} placeholder="Email" type="email" value={email} onChange={setEmail} />
            <Field icon={<Lock className="w-4 h-4" />} placeholder="Пароль" type="password" value={password} onChange={setPassword} />

            {error && (
              <div className="text-xs text-destructive p-2 border border-destructive/40 bg-destructive/10">{error}</div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 bg-primary text-primary-foreground font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 clip-corner border border-glow-primary"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "login" ? "Войти" : "Создать аккаунт"}
            </button>
          </form>
        </div>

        <div className="text-center text-xs text-muted-foreground mt-4">
          {mode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт?"}{" "}
          <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-[var(--neon)] hover:underline">
            {mode === "login" ? "Регистрация" : "Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, placeholder, type = "text", value, onChange }: { icon: React.ReactNode; placeholder: string; type?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 border border-border bg-secondary/30 px-3 py-2 focus-within:border-primary transition-colors">
      <span className="text-muted-foreground">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent flex-1 outline-none text-sm placeholder:text-muted-foreground"
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
