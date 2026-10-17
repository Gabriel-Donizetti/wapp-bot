import { useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Send } from "lucide-react";
import type { Page, PollOverview, Session } from "@wapp/contracts";
import { useResource } from "../lib/use-resource";
import { Badge, dateTime, Empty, ErrorBox, Loading } from "../components/ui";
import { PollResponses } from "../components/poll-responses";

export function PollsPage({
  sessions,
  onCompose,
}: {
  sessions: Session[];
  onCompose: () => void;
}) {
  const [sessionId, setSessionId] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const resource = useResource<Page<PollOverview>>(
    `/polls?limit=${limit}&offset=${offset}${sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ""}`,
  );
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">VOTAÇÕES E RESPOSTAS</p>
          <h1>Enquetes</h1>
          <p>Acompanhe suas enquetes e as respostas por participante.</p>
        </div>
        <button className="primary" onClick={onCompose}>
          <Send size={16} /> Nova enquete
        </button>
      </div>
      <section className="card">
        <div className="section-heading">
          <h2>{resource.data?.total ?? "…"} enquetes</h2>
          <div className="page-actions">
            <label className="filter-label">
              Sessão
              <select
                aria-label="Filtrar enquetes por sessão"
                value={sessionId}
                onChange={(event) => {
                  setSessionId(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Todas as sessões</option>
                {sessions.map((session) => (
                  <option value={session.id} key={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary" onClick={resource.refresh}>
              <RefreshCw size={15} /> Atualizar
            </button>
          </div>
        </div>
        <ErrorBox message={resource.error} />
        {resource.loading && !resource.data ? (
          <Loading />
        ) : resource.data?.data.length ? (
          <>
            <div className="polls-grid">
              {resource.data.data.map((item) => (
                <article
                  className="poll-overview"
                  key={`${item.kind}-${item.recordId}`}
                >
                  <div className="section-heading">
                    <h3>{item.poll.name}</h3>
                    <Badge status={item.deliveryStatus} />
                  </div>
                  <p>
                    {item.sessionId} · {item.to}
                  </p>
                  <small>
                    {item.startedAt
                      ? `Enviada em ${dateTime(item.startedAt)}`
                      : item.sendAt
                        ? `Agendada para ${dateTime(item.sendAt)}`
                        : `Criada em ${dateTime(item.createdAt)}`}
                  </small>
                  <ul>
                    {item.poll.options.map((option) => (
                      <li key={option}>{option}</li>
                    ))}
                  </ul>
                  {item.messageId ? (
                    <PollResponses kind={item.kind} id={item.recordId} />
                  ) : (
                    <p className="footnote">
                      As respostas estarão disponíveis quando o envio retornar
                      um ID WhatsApp.
                    </p>
                  )}
                </article>
              ))}
            </div>
            <div className="pagination">
              <span>
                {offset + 1}–{Math.min(offset + limit, resource.data.total)} de{" "}
                {resource.data.total}
              </span>
              <button
                className="icon-button"
                aria-label="Página anterior de enquetes"
                disabled={offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - limit))}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Próxima página de enquetes"
                disabled={offset + limit >= resource.data.total}
                onClick={() => setOffset((value) => value + limit)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </>
        ) : resource.data && !resource.error ? (
          <Empty title="Nenhuma enquete por aqui">
            Crie uma enquete em Nova mensagem para acompanhar suas respostas.
          </Empty>
        ) : null}
      </section>
    </>
  );
}
