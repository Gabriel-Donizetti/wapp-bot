import { useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { Message, Page, Schedule } from "@wapp/contracts";
import { api } from "../lib/api";
import { useResource } from "../lib/use-resource";
import {
  Badge,
  dateTime,
  Empty,
  ErrorBox,
  Loading,
  useAction,
} from "../components/ui";
export function HistoryPage({ kind }: { kind: "messages" | "schedules" }) {
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const resource = useResource<Page<Message | Schedule>>(
    `/${kind}?limit=${limit}&offset=${offset}${status ? `&status=${status}` : ""}`,
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
                    "sent",
                    "failed",
                    "unknown",
                    "cancelled",
                  ]
                : ["sending", "sent", "failed", "unknown"]
              ).map((value) => (
                <option key={value} value={value}>
                  {
                    {
                      pending: "Pendente",
                      sending: "Enviando",
                      sent: "Enviada",
                      failed: "Falhou",
                      unknown: "Verificar envio",
                      cancelled: "Cancelada",
                    }[value]
                  }
                </option>
              ))}
            </select>
          </label>
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
                      <td className="message-cell">{item.text}</td>
                      <td>
                        <Badge status={item.status} />
                        {item.error ? (
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
              scheduling
                ? "Nenhum agendamento por aqui"
                : "Seu histórico começa com uma mensagem"
            }
          >
            {scheduling
              ? "Programe uma mensagem na página Nova mensagem."
              : "Os envios aparecerão aqui com seu resultado."}
          </Empty>
        )}
      </section>
      <p className="footnote">
        “Enviada” significa que o WhatsApp retornou um ID. Entrega e leitura não
        são confirmadas. Resultados incertos devem ser conferidos antes de um
        novo envio.
      </p>
    </>
  );
}
