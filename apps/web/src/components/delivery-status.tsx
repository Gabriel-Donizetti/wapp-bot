import {
  Check,
  CheckCheck,
  Clock3,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import type { Message, Schedule } from "@wapp/contracts";
import { api } from "../lib/api";
import { Badge, dateTime, useAction } from "./ui";

export function DeliveryStatus({
  item,
  kind,
  onRefresh,
  compact = false,
}: {
  item: Message | Schedule;
  kind: "messages" | "schedules";
  onRefresh: () => void;
  compact?: boolean;
}) {
  const action = useAction();
  const confirmed = ["sent", "delivered", "read", "played"].includes(
    item.status,
  );
  const delivered = ["delivered", "read", "played"].includes(item.status);
  const milestones = [
    ["ID gerado pela sessão", item.submittedAt],
    ["Envio confirmado pelo WhatsApp", item.sentAt],
    ["Entrega confirmada", item.deliveredAt],
    ["Leitura confirmada", item.readAt],
    ["Reprodução confirmada", item.playedAt],
  ];
  const warning =
    item.status === "submitted"
      ? "O WhatsApp ainda não confirmou o envio. Não reenvie a mensagem enquanto aguarda."
      : item.status === "unknown"
        ? "O envio pode ter ocorrido. Confira a conversa antes de iniciar outra tentativa."
        : item.status === "sending"
          ? "O envio está em andamento. Aguarde a confirmação."
          : item.status === "failed"
            ? item.error ||
              "O envio falhou. Confira o histórico antes de iniciar outra tentativa."
            : null;
  return (
    <div className={`delivery-status ${compact ? "compact" : ""}`}>
      <div className="delivery-status-heading">
        {delivered ? (
          <CheckCheck size={17} aria-hidden="true" />
        ) : confirmed ? (
          <Check size={17} aria-hidden="true" />
        ) : warning &&
          item.status !== "sending" &&
          item.status !== "submitted" ? (
          <AlertCircle size={17} aria-hidden="true" />
        ) : (
          <Clock3 size={17} aria-hidden="true" />
        )}
        <Badge status={item.status} />
      </div>
      {warning ? <p className="delivery-warning">{warning}</p> : null}
      <details open={!compact}>
        <summary>Detalhes da confirmação</summary>
        <dl className="receipt-timeline">
          {milestones
            .filter(([, timestamp]) => timestamp)
            .map(([label, timestamp]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{dateTime(timestamp!)}</dd>
              </div>
            ))}
          {!milestones.some(([, timestamp]) => timestamp) ? (
            <div>
              <dt>Ainda sem confirmação do WhatsApp</dt>
            </div>
          ) : null}
          <div>
            <dt>Última consulta ao WhatsApp</dt>
            <dd>
              {item.lastCheckedAt
                ? dateTime(item.lastCheckedAt)
                : "Ainda não realizada"}
            </dd>
          </div>
        </dl>
        <small>
          Horários indicam quando o WappHub registrou cada confirmação.
        </small>
        <small className="receipt-id">Registro: {item.id}</small>
        {item.messageId ? (
          <small className="receipt-id">ID WhatsApp: {item.messageId}</small>
        ) : null}
      </details>
      {item.messageId ? (
        <button
          type="button"
          className="text-button"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await api(`/${kind}/${item.id}/refresh-status`, {
                method: "POST",
              });
              onRefresh();
            })
          }
        >
          <RefreshCw size={14} />
          {action.busy ? "Consultando…" : "Consultar no WhatsApp"}
        </button>
      ) : null}
      {action.feedback}
    </div>
  );
}
