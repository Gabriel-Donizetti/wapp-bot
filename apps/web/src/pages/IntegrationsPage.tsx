import {
  ArrowUpRight,
  BookOpen,
  KeyRound,
  Send,
  Smartphone,
  CalendarClock,
} from "lucide-react";
export function IntegrationsPage() {
  const origin = window.location.origin;
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">CONSTRUA SUAS INTEGRAÇÕES</p>
          <h1>API & integrações</h1>
          <p>Conecte outros aplicativos à sua central de mensagens.</p>
        </div>
        <div className="page-actions">
          <a
            className="primary"
            href="/integration-guide"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={16} />
            Guia de integração
            <ArrowUpRight size={15} />
          </a>
          <a
            className="secondary"
            href="/docs/"
            target="_blank"
            rel="noreferrer"
          >
            Swagger / API
            <ArrowUpRight size={15} />
          </a>
        </div>
      </div>
      <div className="integration-hero">
        <span className="eyebrow light">REST API · V1</span>
        <h2>
          Seu serviço de mensagens,
          <br />
          onde você precisar.
        </h2>
        <code>{origin}/api/v1</code>
      </div>
      <div className="integration-grid">
        {[
          {
            icon: KeyRound,
            title: "1. Crie uma integração",
            text: "Em Usuários, escolha Integração (token), informe o nome e copie o token gerado. Use Authorization: Bearer <token> diretamente; não há login por senha.",
          },
          {
            icon: Smartphone,
            title: "2. Conecte a sessão",
            text: "Cadastre uma sessão e conecte por QR Code ou informe pairingPhoneNumber para obter um código de vinculação. Confirme no celular e aguarde o estado ready antes do envio.",
          },
          {
            icon: Send,
            title: "3. Envie com segurança",
            text: "Informe sessão, destino e o tipo de mensagem. Use Idempotency-Key para evitar repetir o mesmo envio.",
          },
          {
            icon: CalendarClock,
            title: "4. Programe e acompanhe",
            text: "Agende com data e fuso horário. Consulte o histórico e o resultado dos envios.",
          },
        ].map((item) => (
          <article className="card" key={item.title}>
            <item.icon size={22} />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
      <section className="card code-card">
        <h2>Primeiro acesso</h2>
        <p>Crie uma integração em Usuários e substitua o token no exemplo.</p>
        <pre>
          <code>{`curl ${origin}/api/v1/sessions -H 'Authorization: Bearer TOKEN_DA_INTEGRACAO'`}</code>
        </pre>
        <p>
          <a href="/integration-guide" target="_blank" rel="noreferrer">
            Guia de integração com exemplos em cURL, Node.js e Python
          </a>
        </p>
        <p className="footnote">
          O token de integração não expira automaticamente. Ele é mostrado uma
          única vez e pode ser substituído ou revogado por um administrador em
          Usuários. Contas normais continuam usando login por senha e JWT. A
          documentação interativa contém os contratos completos.
        </p>
      </section>
    </>
  );
}
