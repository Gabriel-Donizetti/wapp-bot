import type { FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { useAction } from "../components/ui";
export function AccountPage() {
  const { user, logout } = useAuth();
  const action = useAction();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void action.run(async () => {
      if (data.get("newPassword") !== data.get("confirmation"))
        throw new Error("A confirmação da senha não confere.");
      await api("/auth/change-password", {
        method: "POST",
        body: {
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
        },
      });
      await logout().catch(() => {});
    });
  };
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">SEU ACESSO</p>
          <h1>Minha conta</h1>
          <p>
            {user?.name} · @{user?.username}
          </p>
        </div>
      </div>
      <section className="card account-card">
        <div className="section-heading">
          <h2>Alterar senha</h2>
          <LockKeyhole size={18} />
        </div>
        <p className="muted">
          Após a alteração, seus acessos serão encerrados e será necessário
          entrar novamente.
        </p>
        <form className="stack" onSubmit={submit}>
          <label>
            Senha atual
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <label>
            Nova senha
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
            <small>Mínimo de 12 caracteres.</small>
          </label>
          <label>
            Confirmar nova senha
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          {action.feedback}
          <button className="primary" disabled={action.busy}>
            {action.busy ? "Salvando…" : "Atualizar senha"}
          </button>
        </form>
      </section>
    </>
  );
}
