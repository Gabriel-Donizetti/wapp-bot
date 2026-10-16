import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  CalendarClock,
  Check,
  RefreshCw,
  Search,
  Send,
  Users,
  UserRound,
} from "lucide-react";
import type { Directory, Message, Session } from "@wapp/contracts";
import { api } from "../lib/api";
import { useResource } from "../lib/use-resource";
import { Empty, ErrorBox, Loading, useAction } from "../components/ui";
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
export function ComposePage({
  sessions,
  onSent,
}: {
  sessions: Session[];
  onSent: () => void;
}) {
  const [chosen, setChosen] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("now");
  const [sendAt, setSendAt] = useState("");
  const sessionId =
    chosen ||
    sessions.find((session) => session.status === "ready")?.id ||
    sessions[0]?.id ||
    "";
  const ready =
    sessions.find((session) => session.id === sessionId)?.status === "ready";
  const directory = useResource<Directory>(
    sessionId && ready ? `/sessions/${sessionId}/directory` : null,
    0,
  );
  const action = useAction();
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const recipients = useMemo(
    () => [
      ...(directory.data?.contacts || []).map((item) => ({
        ...item,
        kind: "contact",
      })),
      ...(directory.data?.groups || []).map((item) => ({
        ...item,
        number: null,
        kind: "group",
      })),
    ],
    [directory.data],
  );
  const filtered = useMemo(
    () =>
      recipients.filter(
        (item) =>
          (kind === "all" || item.kind === kind) &&
          normalize(
            `${item.name || ""} ${item.number || ""} ${item.id}`,
          ).includes(normalize(search)),
      ),
    [recipients, kind, search],
  );
  const selected = recipients.find((item) => item.id === to);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void action.run(
      async () => {
        const input = { sessionId, to, text };
        if (mode === "later") {
          const date = new Date(sendAt);
          if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
            throw new Error("Escolha uma data e hora no futuro.");
          await api("/schedules", {
            method: "POST",
            body: { ...input, sendAt: date.toISOString() },
          });
        } else {
          const payload = JSON.stringify(input);
          if (attempt.current?.payload !== payload)
            attempt.current = { payload, key: crypto.randomUUID() };
          const result = await api<Message>("/messages", {
            method: "POST",
            body: input,
            idempotencyKey: attempt.current.key,
          });
          if (result.status !== "sent")
            throw new Error(
              `Envio ${result.status === "unknown" ? "com resultado incerto" : "não concluído"}. Consulte o histórico antes de tentar novamente.`,
            );
          attempt.current = null;
        }
        setText("");
        onSent();
      },
      mode === "later"
        ? "Mensagem agendada com sucesso."
        : "Mensagem enviada ao WhatsApp.",
    );
  };
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">COMECE UMA CONVERSA</p>
          <h1>Nova mensagem</h1>
          <p>Escolha o destino. Envie agora ou programe para depois.</p>
        </div>
        <span className="subtle-tag">Somente texto</span>
      </div>
      <div className="compose-grid">
        <section className="card recipient-panel">
          <div className="section-heading">
            <h2>Destinatários</h2>
            <button
              className="icon-button"
              aria-label="Atualizar contatos e grupos"
              onClick={directory.refresh}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <label>
            Sessão de origem
            <select
              aria-label="Sessão de origem"
              value={sessionId}
              onChange={(event) => {
                setChosen(event.target.value);
                setTo("");
                setSearch("");
              }}
            >
              <option value="">Selecione uma sessão</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented">
            {[
              ["all", "Todos"],
              ["contact", "Contatos"],
              ["group", "Grupos"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={kind === value ? "active" : ""}
                onClick={() => {
                  setKind(value!);
                  setSearch("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label={
                kind === "group"
                  ? "Filtrar grupos pelo nome"
                  : "Buscar contatos e grupos"
              }
              placeholder={
                kind === "group"
                  ? "Filtrar grupos pelo nome…"
                  : "Buscar por nome ou número…"
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <ErrorBox message={directory.error} />
          {directory.data?.warnings.map((warning) => (
            <ErrorBox key={warning.source} message={warning.message} />
          ))}
          <div className="recipient-summary">
            {directory.data?.contacts.length || 0} contatos salvos ·{" "}
            {directory.data?.groups.length || 0} grupos
          </div>
          <div className="recipient-list">
            {!ready ? (
              <Empty title="Conecte uma sessão">
                Os contatos aparecem após a conexão com o WhatsApp.
              </Empty>
            ) : directory.loading ? (
              <Loading />
            ) : !filtered.length ? (
              <Empty title="Nenhum resultado">
                Tente outro nome ou número.
              </Empty>
            ) : (
              filtered.slice(0, 100).map((item) => (
                <button
                  type="button"
                  className={`recipient ${to === item.id ? "selected" : ""}`}
                  key={`${item.kind}-${item.id}`}
                  onClick={() => setTo(item.id)}
                >
                  <span className={`recipient-avatar ${item.kind}`}>
                    {item.kind === "group" ? (
                      <Users size={17} />
                    ) : (
                      <UserRound size={17} />
                    )}
                  </span>
                  <span className="recipient-name">
                    <strong>{item.name || item.number || "Contato"}</strong>
                    <small>
                      {item.kind === "group"
                        ? "Grupo"
                        : item.number || "Contato privado"}
                    </small>
                  </span>
                  {to === item.id ? <Check size={16} /> : null}
                </button>
              ))
            )}
          </div>
          {filtered.length > 100 ? (
            <small>Exibindo 100 de {filtered.length}. Refine sua busca.</small>
          ) : null}
        </section>
        <section className="card message-panel">
          <div className="section-heading">
            <h2>Sua mensagem</h2>
            <Send size={18} className="muted" />
          </div>
          <form className="stack" onSubmit={submit}>
            <label>
              Destino
              {selected ? (
                <small className="selected-name">
                  {selected.name || selected.number}
                </small>
              ) : null}
              <input
                name="to"
                aria-label="Destino"
                placeholder="Selecione ao lado ou digite o telefone com DDI"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                required
              />
            </label>
            <label>
              Mensagem
              <textarea
                name="text"
                rows={9}
                placeholder="Escreva sua mensagem aqui…"
                value={text}
                onChange={(event) => setText(event.target.value)}
                required
                maxLength={4096}
              />
              <span className="character-count">{text.length} / 4.096</span>
            </label>
            <div className="delivery-options">
              <button
                type="button"
                className={mode === "now" ? "selected" : ""}
                onClick={() => setMode("now")}
              >
                <Send size={17} />
                <span>
                  <strong>Enviar agora</strong>
                  <small>Iniciar a conversa</small>
                </span>
              </button>
              <button
                type="button"
                className={mode === "later" ? "selected" : ""}
                onClick={() => setMode("later")}
              >
                <CalendarClock size={18} />
                <span>
                  <strong>Agendar</strong>
                  <small>Escolher data e hora</small>
                </span>
              </button>
            </div>
            {mode === "later" ? (
              <label>
                Data e hora
                <input
                  type="datetime-local"
                  aria-label="Data e hora"
                  value={sendAt}
                  onChange={(event) => setSendAt(event.target.value)}
                  required
                />
                <small>
                  Fuso: {Intl.DateTimeFormat().resolvedOptions().timeZone}. A
                  sessão aguardará reconexão se estiver offline.
                </small>
              </label>
            ) : null}
            {action.feedback}
            <button
              className="primary full"
              disabled={
                action.busy ||
                !sessionId ||
                !text.trim() ||
                (mode === "now" && !ready)
              }
            >
              {action.busy
                ? "Processando…"
                : mode === "later"
                  ? "Agendar mensagem"
                  : "Enviar mensagem"}
              {mode === "later" ? (
                <CalendarClock size={17} />
              ) : (
                <Send size={16} />
              )}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
