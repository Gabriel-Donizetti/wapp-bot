import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  CalendarClock,
  Check,
  RefreshCw,
  Search,
  Send,
  Users,
  UserRound,
} from "lucide-react";
import type {
  Directory,
  Message,
  Schedule,
  Session,
  MessageType,
  SendMessageRequest,
} from "@wapp/contracts";
import { DeliveryStatus } from "../components/delivery-status";
import { api, ApiError } from "../lib/api";
import { useResource } from "../lib/use-resource";
import { Badge, Empty, ErrorBox, Loading, useAction } from "../components/ui";
import {
  MessageFields,
  messageTypeLabels,
  hasCaption,
  readMessageContent,
  readSendOptions,
} from "../components/message-fields";
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
export function ComposePage({
  sessions,
  onSent,
  onManageSessions,
  initialType = "text",
}: {
  sessions: Session[];
  onSent: () => void;
  onManageSessions: () => void;
  initialType?: MessageType;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [messageType, setMessageType] = useState<MessageType>(initialType);
  const [text, setText] = useState("");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("now");
  const [sendAt, setSendAt] = useState("");
  const preferredSessionId =
    sessions.find((session) => session.status === "ready")?.id ||
    sessions[0]?.id ||
    "";
  useEffect(() => {
    if (preferredSessionId)
      setChosen((current) => current ?? preferredSessionId);
  }, [preferredSessionId]);
  const sessionId = chosen ?? preferredSessionId;
  const selectedSession = sessions.find((session) => session.id === sessionId);
  const ready = selectedSession?.status === "ready";
  const connecting =
    selectedSession &&
    ["starting", "authenticated"].includes(selectedSession.status);
  const directory = useResource<Directory>(
    sessionId && ready ? `/sessions/${sessionId}/directory` : null,
    15_000,
  );
  const action = useAction();
  const [failedRequestId, setFailedRequestId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<{
    kind: "messages" | "schedules";
    id: string;
    initial?: Message | Schedule;
  } | null>(null);
  const delivery = useResource<Message | Schedule>(
    tracking ? `/${tracking.kind}/${tracking.id}` : null,
    2000,
  );
  const tracked = delivery.data ?? tracking?.initial;

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
    const form = new FormData(event.currentTarget as HTMLFormElement);
    void action.run(
      async () => {
        const content = await readMessageContent(messageType, form, text);
        const options = readSendOptions(form);
        const input: SendMessageRequest = {
          sessionId,
          to,
          ...content,
          ...(options ? { options } : {}),
        };
        if (mode === "later") {
          const date = new Date(sendAt);
          if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
            throw new Error("Escolha uma data e hora no futuro.");
          const scheduled = await api<Schedule>("/schedules", {
            method: "POST",
            body: { ...input, sendAt: date.toISOString() },
          });
          setTracking({
            kind: "schedules",
            id: scheduled.id,
            initial: scheduled,
          });
        } else {
          const payload = JSON.stringify(input);
          if (attempt.current?.payload !== payload)
            attempt.current = { payload, key: crypto.randomUUID() };
          let result: Message;
          try {
            result = await api<Message>("/messages", {
              method: "POST",
              body: input,
              idempotencyKey: attempt.current.key,
            });
          } catch (error) {
            if (
              error instanceof ApiError &&
              error.details &&
              typeof error.details === "object" &&
              "messageRecordId" in error.details &&
              typeof error.details.messageRecordId === "string"
            ) {
              setTracking({
                kind: "messages",
                id: error.details.messageRecordId,
              });
              setFailedRequestId(error.details.messageRecordId);
            }
            throw error;
          }
          setTracking({ kind: "messages", id: result.id, initial: result });
          setFailedRequestId(null);
          if (["failed", "unknown"].includes(result.status))
            throw new Error(
              result.error ||
                "O envio não foi confirmado. Confira o acompanhamento abaixo.",
            );
          if (["sent", "delivered", "read", "played"].includes(result.status))
            attempt.current = null;
        }
        setText("");
        setMessageType("text");
        onSent();
      },
      mode === "later"
        ? "Mensagem agendada com sucesso."
        : "Envio registrado. Acompanhe a confirmação abaixo.",
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
        <span className="subtle-tag">Texto e mídia</span>
      </div>
      <div className="compose-grid">
        <section className="card recipient-panel">
          <div className="section-heading">
            <h2>Destinatários</h2>
            <button
              className="icon-button"
              aria-label="Atualizar contatos e grupos"
              disabled={!ready || directory.loading}
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
          {selectedSession ? (
            <div className="recipient-session-status">
              <Badge status={selectedSession.status} />
            </div>
          ) : null}
          <ErrorBox message={selectedSession?.error ?? undefined} />
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
            {ready && directory.data
              ? `${directory.data.warnings.some((item) => item.source === "contacts") ? "—" : directory.data.contacts.length} contatos salvos · ${directory.data.warnings.some((item) => item.source === "groups") ? "—" : directory.data.groups.length} grupos`
              : ready && directory.loading
                ? "Carregando contatos e grupos…"
                : ready && directory.error
                  ? "Contatos e grupos indisponíveis"
                  : "Lista disponível quando a sessão estiver pronta"}
          </div>
          <div
            className="recipient-list"
            aria-busy={Boolean(
              connecting || (directory.loading && !directory.data),
            )}
          >
            {connecting ? (
              <>
                <Loading />
                <Empty
                  title={
                    selectedSession.status === "authenticated"
                      ? "Sincronizando WhatsApp"
                      : "Iniciando sessão"
                  }
                >
                  Aguarde a conexão terminar. Os contatos e grupos aparecerão
                  automaticamente.
                </Empty>
                <button className="secondary" onClick={onManageSessions}>
                  Gerenciar sessão
                </button>
              </>
            ) : !ready ? (
              <Empty
                title={
                  !selectedSession
                    ? "Selecione uma sessão"
                    : selectedSession.status === "pairing"
                      ? "Confirme o código no celular"
                      : selectedSession.status === "qr"
                        ? "Leia o QR Code"
                        : "Sessão desconectada"
                }
              >
                {selectedSession?.status === "pairing"
                  ? "Abra Sessões e informe o código no WhatsApp do celular."
                  : selectedSession?.status === "qr"
                    ? "Abra Sessões e leia o QR Code com seu WhatsApp."
                    : "Abra Sessões para conectar ou reconectar o número."}
                <button className="secondary" onClick={onManageSessions}>
                  Gerenciar sessões
                </button>
              </Empty>
            ) : directory.loading && !directory.data ? (
              <Loading />
            ) : directory.error && !directory.data ? (
              <Empty title="Não foi possível carregar a lista">
                Tente novamente. A consulta também será repetida
                automaticamente.
                <button className="secondary" onClick={directory.refresh}>
                  Tentar novamente
                </button>
              </Empty>
            ) : !filtered.length ? (
              <Empty
                title={
                  recipients.length
                    ? "Nenhum resultado"
                    : "Nenhum destinatário disponível"
                }
              >
                {recipients.length
                  ? "Tente outro nome ou número."
                  : "Atualize a lista ou confira os avisos de contatos e grupos acima."}
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
              Tipo de mensagem
              <select
                name="messageType"
                aria-label="Tipo de mensagem"
                value={messageType}
                onChange={(event) => {
                  setMessageType(event.target.value as MessageType);
                  setText("");
                }}
              >
                {Object.entries(messageTypeLabels).map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <MessageFields key={messageType} type={messageType} />
            {messageType === "text" || hasCaption(messageType) ? (
              <label>
                {messageType === "text" ? "Mensagem" : "Legenda (opcional)"}
                <textarea
                  name="text"
                  rows={9}
                  placeholder="Escreva sua mensagem aqui…"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  required={messageType === "text"}
                  maxLength={4096}
                />
                <span className="character-count">{text.length} / 4.096</span>
              </label>
            ) : null}
            <details>
              <summary>Responder a uma mensagem e adicionar menções</summary>
              <div className="stack">
                <label>
                  ID da mensagem citada
                  <input
                    name="replyTo"
                    maxLength={512}
                    placeholder="ID do WhatsApp, disponível na mesma conversa"
                  />
                </label>
                <label>
                  IDs dos usuários mencionados
                  <textarea
                    name="mentions"
                    rows={2}
                    placeholder="5511999999999@c.us"
                  />
                </label>
                <label>
                  Grupos mencionados
                  <textarea
                    name="groupMentions"
                    rows={2}
                    placeholder="120363000000@g.us|Nome do grupo"
                  />
                </label>
                <small>
                  Um ID por linha. No texto, use @número para identificar a
                  menção. O ID citado é messageId, não o ID do registro no
                  WappHub.
                </small>
              </div>
            </details>
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
            {tracking ? (
              <section
                className="delivery-card"
                aria-label="Acompanhamento da mensagem"
              >
                <h3>Acompanhamento da mensagem</h3>
                {tracked ? (
                  <DeliveryStatus
                    item={tracked}
                    kind={tracking.kind}
                    onRefresh={delivery.refresh}
                  />
                ) : (
                  <Loading />
                )}
                <ErrorBox message={delivery.error} />
              </section>
            ) : null}
            {tracked &&
            tracking?.kind === "messages" &&
            ["submitted", "sending"].includes(tracked.status) ? (
              <ErrorBox message={action.error} />
            ) : tracking?.id === failedRequestId &&
              tracked &&
              ["sent", "delivered", "read", "played"].includes(
                tracked.status,
              ) ? (
              <p role="status">
                A confirmação chegou após a resposta inicial. O status atual
                aparece no acompanhamento.
              </p>
            ) : (
              action.feedback
            )}
            <button
              className="primary full"
              disabled={
                action.busy ||
                !sessionId ||
                (messageType === "text" && !text.trim()) ||
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
