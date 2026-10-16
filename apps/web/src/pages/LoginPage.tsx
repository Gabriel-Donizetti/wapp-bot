import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBox } from "../components/ui";
export function LoginPage() {
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await login(String(data.get("username")), String(data.get("password")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao entrar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-layout">
      <section className="login-story">
        <a className="brand" href="/">
          <span className="brand-icon">
            <MessageCircle size={23} />
          </span>{" "}
          wapp<span className="brand-dot">.</span>
        </a>
        <div>
          <span className="eyebrow light">CONVERSAS QUE CONECTAM</span>
          <h1>
            Uma central.
            <br />
            Todas as suas
            <br />
            <em>conexões.</em>
          </h1>
          <p>
            Organize seus números, converse com quem importa e programe a
            próxima mensagem.
          </p>
          <div className="login-feature">
            <ShieldCheck size={18} /> Seu time conectado, com acesso controlado.
          </div>
        </div>
        <small>Wapp · Open source, feito para integrar.</small>
      </section>
      <section className="login-form-area">
        <form onSubmit={submit} className="login-form">
          <span className="login-lock">
            <LockKeyhole size={21} />
          </span>
          <p className="eyebrow">BEM-VINDO DE VOLTA</p>
          <h2>Acesse sua central</h2>
          <p>Entre com suas credenciais para continuar.</p>
          <ErrorBox message={error} />
          <label>
            Usuário
            <input
              name="username"
              autoComplete="username"
              placeholder="Seu usuário"
              required
              autoFocus
              maxLength={64}
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Sua senha"
              required
              maxLength={128}
            />
          </label>
          <button disabled={busy} className="primary full">
            {busy ? "Entrando…" : "Entrar na central"}
            <ArrowRight size={17} />
          </button>
          <small>
            Precisa de acesso? Fale com o administrador da sua central.
          </small>
        </form>
      </section>
    </main>
  );
}
