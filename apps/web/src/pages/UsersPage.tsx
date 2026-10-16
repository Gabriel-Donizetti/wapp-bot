import { useState, type FormEvent } from "react";
import { Plus, ShieldCheck, UserRound } from "lucide-react";
import type { User } from "@wapp/contracts";
import { api } from "../lib/api";
import { useResource } from "../lib/use-resource";
import { dateTime, ErrorBox, Modal, useAction } from "../components/ui";
export function UsersPage() {
  const users = useResource<{ users: User[] }>("/auth/users");
  const [creating, setCreating] = useState(false);
  const action = useAction();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    void action.run(async () => {
      await api("/auth/users", { method: "POST", body: data });
      setCreating(false);
      users.refresh();
    });
  };
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">ACESSO À CENTRAL</p>
          <h1>Usuários</h1>
          <p>Crie acessos para seu time e contas dedicadas para integrações.</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Novo usuário
        </button>
      </div>
      <ErrorBox message={users.error} />
      <div className="users-grid">
        {users.data?.users.map((user) => (
          <article className="card user-card" key={user.id}>
            <span className="device-icon">
              {user.role === "admin" ? (
                <ShieldCheck size={22} />
              ) : (
                <UserRound size={22} />
              )}
            </span>
            <h3>{user.name}</h3>
            <p>@{user.username}</p>
            <span className="subtle-tag">
              {user.role === "admin" ? "Administrador" : "Operador"}
            </span>
            <small>Criado em {dateTime(user.createdAt)}</small>
          </article>
        ))}
      </div>
      <p className="footnote">
        Todos os usuários autenticados compartilham as sessões e o histórico
        deste workspace. Apenas administradores podem criar usuários.
      </p>
      {creating ? (
        <Modal title="Criar usuário" onClose={() => setCreating(false)}>
          <form className="stack" onSubmit={submit}>
            <label>
              Nome
              <input name="name" required maxLength={100} autoFocus />
            </label>
            <label>
              Usuário
              <input
                name="username"
                pattern="[a-z0-9_.-]{3,64}"
                minLength={3}
                maxLength={64}
                required
                autoComplete="off"
              />
            </label>
            <label>
              Senha inicial
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete="new-password"
              />
              <small>Use pelo menos 12 caracteres.</small>
            </label>
            <label>
              Perfil
              <select name="role">
                <option value="operator">Operador</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            {action.feedback}
            <button className="primary full" disabled={action.busy}>
              {action.busy ? "Criando…" : "Criar usuário"}
            </button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
