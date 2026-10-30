import { useCallback, useState, type FormEvent } from "react";
import { Copy, KeyRound, Plus, ShieldCheck, UserRound } from "lucide-react";
import type { CreatedUser, IntegrationToken, User } from "@wapp/contracts";
import { api } from "../lib/api";
import { useResource } from "../lib/use-resource";
import { dateTime, ErrorBox, Modal, useAction } from "../components/ui";

export function UsersPage() {
  const users = useResource<{ users: User[] }>("/auth/users");
  const [creating, setCreating] = useState(false);
  const [accountType, setAccountType] = useState<User["type"]>("user");
  const [secret, setSecret] = useState<{ name: string; token: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [management, setManagement] = useState<{
    user: User;
    kind: "rotate" | "revoke";
  } | null>(null);
  const action = useAction();
  const closeCreator = useCallback(() => setCreating(false), []);
  const closeSecret = useCallback(() => setSecret(null), []);
  const closeManagement = useCallback(() => setManagement(null), []);
  const showToken = (name: string, token: string) => {
    setCopied(false);
    setSecret({ name, token });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    void action.run(async () => {
      const created = await api<CreatedUser>("/auth/users", {
        method: "POST",
        body: data,
      });
      setCreating(false);
      users.refresh();
      if (created.token) showToken(created.name, created.token);
    });
  };
  const manage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!management) return;
    const { user, kind } = management;
    void action.run(async () => {
      if (kind === "rotate") {
        const result = await api<IntegrationToken>(
          `/auth/users/${user.id}/token`,
          { method: "POST" },
        );
        showToken(user.name, result.token);
      } else {
        await api(`/auth/users/${user.id}/token`, { method: "DELETE" });
      }
      setManagement(null);
      users.refresh();
    });
  };
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">ACESSO À CENTRAL</p>
          <h1>Usuários</h1>
          <p>Crie acessos para seu time e tokens dedicados para integrações.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setAccountType("user");
            setCreating(true);
          }}
        >
          <Plus size={16} /> Novo usuário
        </button>
      </div>
      <ErrorBox message={users.error} />
      <div className="users-grid">
        {users.data?.users.map((user) => (
          <article className="card user-card" key={user.id}>
            <span className="device-icon">
              {user.type === "integration" ? (
                <KeyRound size={22} />
              ) : user.role === "admin" ? (
                <ShieldCheck size={22} />
              ) : (
                <UserRound size={22} />
              )}
            </span>
            <h3>{user.name}</h3>
            <p>
              {user.type === "integration"
                ? "Acesso à API por token"
                : `@${user.username}`}
            </p>
            <span className="subtle-tag">
              {user.type === "integration"
                ? "Integração"
                : user.role === "admin"
                  ? "Administrador"
                  : "Operador"}
            </span>
            {user.type === "integration" && (
              <p>{user.active ? "Token ativo" : "Token revogado"}</p>
            )}
            <small>Criado em {dateTime(user.createdAt)}</small>
            {user.type === "integration" && (
              <div className="page-actions">
                <button
                  className="text-button"
                  onClick={() => setManagement({ user, kind: "rotate" })}
                >
                  Gerar novo token
                </button>
                {user.active && (
                  <button
                    className="text-button danger"
                    onClick={() => setManagement({ user, kind: "revoke" })}
                  >
                    Revogar token
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="footnote">
        Usuários e integrações compartilham as sessões e o histórico deste
        workspace. Integrações têm acesso de operador. Apenas administradores
        gerenciam usuários e tokens.
      </p>
      {creating && (
        <Modal title="Criar usuário" onClose={closeCreator}>
          <form className="stack" onSubmit={submit}>
            <label>
              Tipo de acesso
              <select
                name="type"
                value={accountType}
                onChange={(event) =>
                  setAccountType(event.target.value as User["type"])
                }
              >
                <option value="user">Usuário normal</option>
                <option value="integration">Integração (token)</option>
              </select>
            </label>
            <label>
              Nome
              <input name="name" required maxLength={100} autoFocus />
            </label>
            {accountType === "user" ? (
              <>
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
              </>
            ) : (
              <p className="muted">
                O token será gerado ao criar a integração. Ela não terá usuário
                nem senha. Copie o token na próxima tela; ele não poderá ser
                consultado novamente.
              </p>
            )}
            {action.feedback}
            <button className="primary full" disabled={action.busy}>
              {action.busy
                ? "Criando…"
                : accountType === "integration"
                  ? "Criar integração"
                  : "Criar usuário"}
            </button>
          </form>
        </Modal>
      )}
      {management && (
        <Modal
          title={
            management.kind === "rotate" ? "Gerar novo token" : "Revogar token"
          }
          onClose={closeManagement}
        >
          <form className="stack" onSubmit={manage}>
            <p>{management.user.name}</p>
            <p>
              {management.kind === "rotate"
                ? "O token atual deixará de funcionar imediatamente. Atualize a integração com o novo token após gerá-lo."
                : "A integração perderá acesso à API imediatamente. Para reativá-la, gere um novo token."}
            </p>
            {action.feedback}
            <button className="primary full" disabled={action.busy}>
              {action.busy
                ? "Aguarde…"
                : management.kind === "rotate"
                  ? "Gerar token"
                  : "Confirmar revogação"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={action.busy}
              onClick={closeManagement}
            >
              Cancelar
            </button>
          </form>
        </Modal>
      )}
      {secret && (
        <Modal title="Token da integração" onClose={closeSecret}>
          <div className="stack">
            <h3>{secret.name}</h3>
            <p>
              Guarde este token agora. Ele é exibido somente nesta tela e não
              pode ser recuperado depois.
            </p>
            <label>
              Token
              <textarea
                aria-label="Token da integração"
                readOnly
                rows={3}
                value={secret.token}
                spellCheck={false}
              />
            </label>
            <small>
              Use Authorization: Bearer &lt;token&gt;. O token funciona até ser
              substituído ou revogado.
            </small>
            {action.feedback}
            <button
              className="secondary"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await navigator.clipboard.writeText(secret.token);
                  setCopied(true);
                })
              }
            >
              <Copy size={15} /> {copied ? "Token copiado" : "Copiar token"}
            </button>
            <button className="primary full" onClick={closeSecret}>
              Já guardei o token
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
