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
            title: "1. Autentique",
            text: "Obtenha um JWT com usuário e senha. Crie uma conta de operador dedicada a cada aplicativo.",
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
        <p>Substitua os valores pelas credenciais da sua integração.</p>
        <pre>
          <code>{`curl -X POST ${origin}/api/v1/auth/login \\\n  -H 'Content-Type: application/json' \\\n  -d '{"username":"seu-app","password":"sua-senha"}'\n\ncurl ${origin}/api/v1/sessions \\\n  -H 'Authorization: Bearer SEU_TOKEN_JWT'`}</code>
        </pre>
        <p>
          <a href="/integration-guide" target="_blank" rel="noreferrer">
            Guia de integração com exemplos em cURL, Node.js e Python
          </a>
        </p>
        <p className="footnote">
          O token tem validade limitada e pode ser revogado pelo endpoint de
          logout. A documentação interativa contém todas as rotas, parâmetros e
          respostas.
        </p>
      </section>
    </>
  );
}
