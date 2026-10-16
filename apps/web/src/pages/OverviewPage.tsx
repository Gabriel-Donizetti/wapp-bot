import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Send,
  Smartphone,
} from "lucide-react";
import type { Message, Page, Schedule, Session } from "@wapp/contracts";
import { useResource } from "../lib/use-resource";
import { Badge, dateTime, Empty, ErrorBox } from "../components/ui";
export function OverviewPage({
  sessions,
  onNavigate,
}: {
  sessions: Session[];
  onNavigate: (page: string) => void;
}) {
  const pending = useResource<Page<Schedule>>(
    "/schedules?status=pending&limit=5&order=asc",
  );
  const messages = useResource<Page<Message>>("/messages?limit=5");
  const ready = sessions.filter((session) => session.status === "ready").length;
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">SUA CENTRAL, EM TEMPO REAL</p>
          <h1>Visão geral</h1>
          <p>Um olhar sobre suas conexões e próximas conversas.</p>
        </div>
        <button className="primary" onClick={() => onNavigate("compose")}>
          <Send size={16} />
          Nova mensagem
        </button>
      </div>
      <div className="stats-grid">
        {[
          {
            label: "Sessões cadastradas",
            value: sessions.length,
            icon: Smartphone,
            note: "Números na central",
          },
          {
            label: "Conexões ativas",
            value: ready,
            icon: CheckCircle2,
            note: ready ? "Prontas para conversar" : "Aguardando conexão",
          },
          {
            label: "Envios registrados",
            value: messages.data?.total || 0,
            icon: Send,
            note: "Envios imediatos registrados",
          },
          {
            label: "Agendamentos pendentes",
            value: pending.data?.total || 0,
            icon: CalendarClock,
            note: "Aguardando o próximo horário",
          },
        ].map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div>
              <span>{stat.label}</span>
              <stat.icon size={18} />
            </div>
            <strong>{stat.value}</strong>
            <small>{stat.note}</small>
          </article>
        ))}
      </div>
      <div className="welcome-banner">
        <div>
          <span className="subtle-tag">TUDO COMEÇA COM UMA CONEXÃO</span>
          <h2>Pronto para sua próxima conversa?</h2>
          <p>Gerencie as sessões e mantenha sua comunicação organizada.</p>
          <button
            className="text-button"
            onClick={() => onNavigate("sessions")}
          >
            Gerenciar sessões
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span>W</span>
          <i />
          <b />
        </div>
      </div>
      <div className="overview-grid">
        <section className="card">
          <div className="section-heading">
            <h2>Últimos envios</h2>
            <button
              className="text-button"
              onClick={() => onNavigate("messages")}
            >
              Ver histórico
              <ArrowUpRight size={14} />
            </button>
          </div>
          <ErrorBox message={messages.error} />
          {messages.data?.data.length ? (
            messages.data.data.map((item) => (
              <div className="activity" key={item.id}>
                <span className="activity-icon">
                  <Send size={15} />
                </span>
                <div>
                  <strong>{item.sessionId}</strong>
                  <p>{item.text}</p>
                  <small>{dateTime(item.createdAt)}</small>
                </div>
                <Badge status={item.status} />
              </div>
            ))
          ) : (
            <Empty title="Ainda sem mensagens">
              Quando você enviar, poderá acompanhar por aqui.
            </Empty>
          )}
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>Próximos agendamentos</h2>
            <button
              className="text-button"
              onClick={() => onNavigate("schedules")}
            >
              Ver todos
              <ArrowUpRight size={14} />
            </button>
          </div>
          <ErrorBox message={pending.error} />
          {pending.data?.data.length ? (
            pending.data.data.map((item) => (
              <div className="activity" key={item.id}>
                <span className="activity-icon">
                  <CalendarClock size={17} />
                </span>
                <div>
                  <strong>{item.sessionId}</strong>
                  <p>{item.text}</p>
                  <small>{dateTime(item.sendAt)}</small>
                </div>
                <Badge status={item.status} />
              </div>
            ))
          ) : (
            <Empty title="Sua agenda está livre">
              Programe uma mensagem para o momento certo.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}
