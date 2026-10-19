import { useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { Message, Page, Schedule, Session } from "@wapp/contracts";
import { api } from "../lib/api";
import { useResource } from "../lib/use-resource";
import {
  statusNames,
  dateTime,
  Empty,
  ErrorBox,
  Loading,
  useAction,
} from "../components/ui";
import { PollResponses } from "../components/poll-responses";
import { DeliveryStatus } from "../components/delivery-status";
export function HistoryPage({
  kind,
  sessions,
}: {
  kind: "messages" | "schedules";
  sessions: Session[];
}) {
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const resource = useResource<Page<Message | Schedule>>(
    `/${kind}?limit=${limit}&offset=${offset}${status ? `&status=${status}` : ""}${sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ""}`,
  );
  const action = useAction();
  const scheduling = kind === "schedules";
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">
            {scheduling ? "PROGRAMAÇÃO" : "REGISTRO DE ATIVIDADE"}
          </p>
          <h1>{scheduling ? "Agendamentos" : "Histórico de mensagens"}</h1>
          <p>
            {scheduling
              ? "Acompanhe os próximos envios e gerencie sua programação."
              : "Consulte o resultado dos envios feitos pelo painel e pela API."}
          </p>
        </div>
        <button className="secondary" onClick={resource.refresh}>
          <RefreshCw size={15} />
          Atualizar
        </button>
      </div>
      <section className="card">
        <div className="section-heading">
          <h2>
            {resource.data?.total || 0}{" "}
            {scheduling ? "agendamentos" : "mensagens"}
          </h2>
          <div className="page-actions">
            <label className="filter-label">
              Sessão
              <select
                aria-label="Filtrar por sessão"
                value={sessionId}
                onChange={(event) => {
                  setSessionId(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Todas as sessões</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} ({session.id})
                  </option>
                ))}
                {sessionId &&
                !sessions.some((session) => session.id === sessionId) ? (
                  <option value={sessionId}>{sessionId} (indisponível)</option>
                ) : null}
              </select>
            </label>
            <label className="filter-label">
              Status
              <select
                aria-label="Filtrar status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Todos os status</option>
                {(scheduling
                  ? [
                      "pending",
                      "sending",
                      "submitted",
                      "sent",
                      "delivered",
                      "read",
                      "played",
                      "failed",
                      "unknown",
                      "cancelled",
                    ]
                  : [
                      "sending",
                      "submitted",
                      "sent",
                      "delivered",
                      "read",
                      "played",
                      "failed",
                      "unknown",
                    ]
                ).map((value) => (
                  <option key={value} value={value}>
                    {statusNames[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <ErrorBox message={resource.error} />
        {action.feedback}
        {resource.loading && !resource.data ? (
          <Loading />
        ) : resource.data?.data.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{scheduling ? "Horário do envio" : "Criada em"}</th>
                    <th>Sessão / destino</th>
                    <th>Mensagem</th>
                    <th>Status</th>
                    {scheduling ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {resource.data.data.map((item) => (
                    <tr key={item.id}>
                      <td className="nowrap">
                        {dateTime(
                          "sendAt" in item ? item.sendAt : item.createdAt,
                        )}
                      </td>
                      <td>
                        <strong>{item.sessionId}</strong>
                        <small>{item.to}</small>
                      </td>
                      <td className="message-cell">
                        {item.text}
                        {item.type === "poll" && item.messageId ? (
                          <PollResponses id={item.id} kind={kind} />
                        ) : null}
                      </td>
                      <td>
                        <DeliveryStatus
                          item={item}
                          kind={kind}
                          onRefresh={resource.refresh}
                          compact
                        />
                        {item.error && item.status !== "failed" ? (
                          <small className="row-error">{item.error}</small>
                        ) : null}
                      </td>
                      {scheduling ? (
                        <td>
                          {item.status === "pending" ? (
                            <button
                              className="text-button danger"
                              disabled={action.busy}
                              onClick={() =>
                                void action.run(async () => {
                                  await api(`/schedules/${item.id}/cancel`, {
                                    method: "POST",
                                  });
                                  resource.refresh();
                                })
                              }
                            >
                              Cancelar
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {offset + 1}–{Math.min(offset + limit, resource.data.total)} de{" "}
                {resource.data.total}
              </span>
              <button
                className="icon-button"
                aria-label="Página anterior"
                disabled={offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - limit))}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Próxima página"
                disabled={offset + limit >= resource.data.total}
                onClick={() => setOffset((value) => value + limit)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </>
        ) : (
          <Empty
            title={
              sessionId || status
                ? "Nenhum resultado com esses filtros"
                : scheduling
                  ? "Nenhum agendamento por aqui"
                  : "Seu histórico começa com uma mensagem"
            }
          >
            {sessionId || status
              ? "Escolha outra sessão ou status para consultar os registros."
              : scheduling
                ? "Programe uma mensagem na página Nova mensagem."
                : "Os envios aparecerão aqui com seu resultado."}
          </Empty>
        )}
      </section>
      <p className="footnote">
        “Enviada ao WhatsApp” exige confirmação do servidor. “Entregue” e “Lida”
        dependem das confirmações disponibilizadas pelo WhatsApp. Em grupos e
        canais, o status não substitui confirmações individuais. A ausência de
        leitura não comprova que a pessoa não leu. A lista atualiza
        automaticamente.
      </p>
    </>
  );
}
