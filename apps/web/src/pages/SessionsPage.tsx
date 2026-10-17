import { useState, type FormEvent } from "react";
import { Plus, RefreshCw, Smartphone, Unplug, Trash2 } from "lucide-react";
import type { Session } from "@wapp/contracts";
import { api } from "../lib/api";
import { useResource } from "../lib/use-resource";
import { Badge, Empty, ErrorBox, Modal, useAction } from "../components/ui";
function SessionCard({
  session,
  onChange,
}: {
  session: Session;
  onChange: () => void;
}) {
  const qr = useResource<{ qr: string | null }>(
    session.status === "qr" ? `/sessions/${session.id}/qr` : null,
    3000,
  );
  const action = useAction();
  const perform = (path: string, method = "POST") =>
    action.run(async () => {
      await api(path, { method });
      onChange();
    });
  return (
    <article className="session-card">
      <div className="session-card-top">
        <span className="device-icon">
          <Smartphone size={23} />
        </span>
        <Badge status={session.status} />
      </div>
      <h3>{session.name}</h3>
      <p>
        {session.phone ? `+${session.phone}` : "Número ainda não vinculado"}
      </p>
      <code>{session.id}</code>
      {session.status === "qr" ? (
        <div className="qr-box">
          {qr.data?.qr ? (
            <img
              src={qr.data.qr}
              alt={`QR Code para conectar ${session.name}`}
            />
          ) : (
            <span>Gerando QR Code…</span>
          )}
          <small>WhatsApp → Aparelhos conectados → Conectar aparelho</small>
        </div>
      ) : null}
      <ErrorBox message={session.error || qr.error} />
      {action.feedback}
      <div className="session-actions">
        {session.status === "authenticated" ? (
          <button
            className="secondary"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api(`/sessions/${session.id}/disconnect`, {
                  method: "POST",
                });
                await api(`/sessions/${session.id}/connect`, {
                  method: "POST",
                });
                onChange();
              })
            }
          >
            <RefreshCw size={14} /> Reiniciar conexão
          </button>
        ) : null}
        {["disconnected", "error"].includes(session.status) ? (
          <button
            className="secondary"
            disabled={action.busy}
            onClick={() => void perform(`/sessions/${session.id}/connect`)}
          >
            <RefreshCw size={14} />
            Reconectar
          </button>
        ) : null}
        {session.status === "ready" ? (
          <button
            className="secondary"
            disabled={action.busy}
            onClick={() => void perform(`/sessions/${session.id}/disconnect`)}
          >
            <Unplug size={14} />
            Desconectar
          </button>
        ) : null}
        <button
          className="icon-button danger"
          aria-label={`Remover ${session.name}`}
          disabled={action.busy}
          onClick={() => {
            if (
              confirm(
                `Remover ${session.name}? Agendamentos pendentes serão cancelados.`,
              )
            )
              void perform(`/sessions/${session.id}`, "DELETE");
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}
export function SessionsPage({
  sessions,
  onChange,
  error,
}: {
  sessions: Session[];
  onChange: () => void;
  error?: string;
}) {
  const [creating, setCreating] = useState(false);
  const action = useAction();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    void action.run(async () => {
      await api("/sessions", { method: "POST", body: data });
      setCreating(false);
      onChange();
    });
  };
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">CANAIS DE COMUNICAÇÃO</p>
          <h1>Suas sessões</h1>
          <p>Conecte e gerencie os números da sua central.</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>
          <Plus size={17} />
          Nova sessão
        </button>
      </div>
      <ErrorBox message={error} />
      {sessions.length ? (
        <div className="sessions-grid">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onChange={onChange}
            />
          ))}
        </div>
      ) : (
        <section className="card">
          <Empty title="Sua primeira conexão começa aqui">
            Adicione uma sessão e escaneie o QR Code com o WhatsApp.
          </Empty>
        </section>
      )}
      {creating ? (
        <Modal title="Adicionar sessão" onClose={() => setCreating(false)}>
          <p className="muted">Cada sessão conecta um número de WhatsApp.</p>
          <form className="stack" onSubmit={submit}>
            <label>
              Nome da sessão
              <input
                name="name"
                placeholder="Atendimento comercial"
                maxLength={100}
                required
                autoFocus
              />
            </label>
            <label>
              Identificador
              <input
                name="id"
                placeholder="comercial"
                pattern="[a-zA-Z0-9_-]{1,64}"
                maxLength={64}
                required
              />
              <small>
                Use letras, números, hífen ou sublinhado. Esse ID será usado na
                API.
              </small>
            </label>
            {action.feedback}
            <button className="primary full" disabled={action.busy}>
              {action.busy ? "Criando…" : "Criar sessão"}
            </button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
