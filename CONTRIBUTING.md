# Contribuir com o Wapp

Use Node.js 24 e PostgreSQL 16+ local. Docker Compose é usado para validar
as imagens e para quem escolher executar a stack em containers. Leia o README para configurar o ambiente.

1. Crie uma branch para sua alteração.
2. Mantenha regras de negócio nos módulos de `apps/api/src/modules` e acesso ao
   banco nos repositórios. Rotas validam entradas e apresentam as respostas.
3. Crie migrações novas para mudanças de banco; não reescreva migrações aplicadas.
4. Atualize o contrato OpenAPI e os tipos compartilhados quando uma rota mudar.
5. Execute `npm run check`, `CHROME_NO_SANDBOX=true npm run test:ui` e
   `git diff --check` antes de enviar o pull request.

Os testes usam PostgreSQL real em schemas descartáveis de `TEST_DATABASE_URL` e
um cliente WhatsApp simulado. Não use um banco de produção em testes e não
adicione números, mensagens, credenciais ou perfis reais aos exemplos.

Não remova a distinção entre `failed` e `unknown`: um envio interrompido pode
ter sido recebido pelo WhatsApp. Alterações de retry precisam preservar essa
garantia e a idempotência dos envios imediatos.

Ao relatar um problema, inclua passos para reproduzir, versões, erro e o
`X-Request-ID`, com dados pessoais e segredos removidos.
