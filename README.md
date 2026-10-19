<p align="center"><strong>WappHub</strong> · Central de mensagens</p>

# Uma central para suas conexões WhatsApp

Monorepo para gerenciar sessões WhatsApp, enviar texto e mídia, consultar
contatos e grupos e agendar mensagens. Inclui painel React, API Express com JWT,
PostgreSQL, histórico de envios e execução com Docker Compose.

[![CI](https://github.com/Gabriel-Donizetti/wapp-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/Gabriel-Donizetti/wapp-bot/actions/workflows/ci.yml)

![Painel WappHub com sessões, histórico e agendamentos](docs/images/dashboard.png)

## O que você pode fazer

- Conectar vários números por QR Code ou código de vinculação e restaurar os perfis após reinícios.
- Enviar texto, imagem, áudio, voz, vídeo/GIF, documentos, figurinhas, localização,
  cartões de contato e enquetes para pessoas, grupos ou canais compatíveis.
- Responder mensagens, mencionar pessoas/grupos e consultar os resultados.
- Consultar respostas de enquetes, com coleta automática, votos salvos e prazo de acompanhamento (padrão de 1 dia).
- Agendar envios com data, hora e fuso; cancelar pendências pelo painel ou API.
- Pesquisar grupos pelo nome e contatos salvos, sem duplicatas de identificador.
- Criar usuários administradores, operadores e contas para integrações.
- Integrar outros aplicativos por uma API versionada com documentação OpenAPI.

O WappHub usa [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js), um cliente
não oficial. Não há garantia contra bloqueios de números. O projeto não é
afiliado ao WhatsApp ou à Meta; use-o para comunicações esperadas pelos
destinatários e respeite as regras da plataforma.

## Iniciar com Docker

O [guia Docker](docs/docker.md) detalha as variáveis de ambiente, o primeiro
acesso, a persistência e as URLs para integrar outros aplicativos. Inclui uma
opção para gerar a configuração sem instalar Node.js no host.

Requisito: Docker com Compose. O exemplo abaixo usa Node.js 24 no host para
gerar a configuração; a alternativa sem Node no host está no guia Docker.

```bash
git clone https://github.com/Gabriel-Donizetti/wapp-bot.git
cd wapp-bot
node scripts/setup.mjs
docker compose up -d --build --wait
```

O script gera segredos aleatórios em `.env` e salva o primeiro acesso em
`data/initial-admin.txt`, com permissão restrita. Se `.env` já existir, ele é
preservado. O usuário inicial é `admin`; a senha não é fixa nem publicada.

- Painel: [http://127.0.0.1:3000](http://127.0.0.1:3000).
- Documentação interativa: [http://127.0.0.1:3000/docs/](http://127.0.0.1:3000/docs/).
- OpenAPI: [http://127.0.0.1:3000/openapi.json](http://127.0.0.1:3000/openapi.json).

Entre no painel e altere a senha em **Minha conta**. Depois, remova a senha de
bootstrap do `.env` e exclua `data/initial-admin.txt`. O bootstrap só cria o
primeiro usuário quando o banco está vazio; não redefine senhas existentes.

Adicione uma sessão em **Sessões** e escolha QR Code ou código com número de
telefone. Para usar código, informe o número com DDI e digite o código exibido
no WhatsApp em **Aparelhos conectados → Conectar aparelho → Conectar com número
de telefone**. Aguarde o estado **Conectada**. O cadastro no WappHub não cria uma
conta de WhatsApp.

```bash
docker compose ps
docker compose logs -f api
docker compose down
```

O Compose inicia PostgreSQL, API e frontend Nginx. Os dados do banco e os perfis
WhatsApp ficam em volumes separados. `docker compose down` preserva os volumes;
a opção `-v` remove os dados e deve ser usada apenas quando essa exclusão for
intencional. O frontend expõe somente `127.0.0.1` por padrão; para publicação
externa, configure um proxy com HTTPS.

## Desenvolvimento local (sem containers)

Requisitos: Node.js 24, PostgreSQL 16+ instalado no host e Google Chrome para
vídeos. FFmpeg é necessário para converter figurinhas animadas. O script
`db:local:start` usa `pg_ctl`/`initdb` do PostgreSQL instalado para manter um
cluster privado em `data/local-postgres/cluster`, na porta de `DATABASE_URL`.
Se os binários não forem encontrados, defina `LOCAL_POSTGRES_BIN` no `.env`.
Escolha uma porta livre; não aponte esse script para um banco remoto.

```bash
nvm use
npm ci
node scripts/setup.mjs
npm run db:local:start
npm run db:migrate
npm run dev
```

O frontend fica em `http://127.0.0.1:5173` e encaminha `/api`, `/docs` e
`/openapi.json` à API em `http://127.0.0.1:3000`. Pare os containers `web` e `api`
se já estiverem usando as mesmas portas. API, React e banco rodam no host.
Use `npm run db:local:status` para verificar o banco e `npm run db:local:stop`
para pará-lo. O script cria os bancos de desenvolvimento e teste caso estejam
ausentes; preserva dados existentes. Instalações de PostgreSQL já administradas
por um serviço do sistema também podem ser usadas diretamente via URLs, sem
executar o script.

Esse cluster de desenvolvimento usa `dynamic_shared_memory_type=mmap`, com
arquivos dentro do diretório de dados, para não depender dos segmentos POSIX
em `/dev/shm` de um usuário comum. A configuração vale para o script local;
instalações gerenciadas e Docker mantêm sua configuração de PostgreSQL.
Se o cluster já estava rodando antes desse ajuste, pare a API, execute
`npm run db:local:stop` e `npm run db:local:start` e inicie a API novamente.

Para servir a versão compilada localmente:

```bash
npm run build
npm start
```

A API também serve o build React quando `apps/web/dist` está presente. O
Puppeteer baixa o navegador na instalação; se necessário, execute
`npx puppeteer browsers install chrome`. No Ubuntu com bloqueio de sandbox,
consulte a [orientação do Puppeteer](https://pptr.dev/troubleshooting) ou ajuste
`CHROME_NO_SANDBOX=true` para seu ambiente. No container amd64, Google Chrome é instalado pelo sistema; em ARM, Chromium.
O suporte de vídeo em ARM depende dos codecs do navegador e precisa de
validação. O processo roda com usuário sem privilégios e sandbox desabilitado.

## Organização

```text
apps/
  api/
    src/
      config/                # Leitura e validação das variáveis
      database/migrations/   # Migrações versionadas e importação legada
      http/                  # Contrato OpenAPI e consultas
      modules/
        auth/                # Usuários, senhas, JWT e revogação
        sessions/            # Conexões por QR/código e agenda WhatsApp
        messages/            # Envio, histórico e idempotência
        schedules/           # Agendamento e processamento
      shared/                # Erros e validação de entradas
    test/                    # Integração com PostgreSQL real
  web/src/
    auth/                    # Acesso autenticado do painel
    components/              # Componentes de interface
    lib/                     # Cliente HTTP e carregamento de dados
    pages/                   # Visão geral, sessões, mensagens e usuários
packages/contracts/          # Tipos compartilhados entre API e frontend
test/                        # Verificação do navegador de ponta a ponta
scripts/                     # Configuração local
```

As rotas validam entradas, os serviços coordenam o comportamento e os
repositórios acessam o PostgreSQL com consultas parametrizadas. As migrações são
executadas em transações e registradas em `schema_migrations`. A API adquire um
lock no PostgreSQL para impedir dois processos de sessões no mesmo schema.

## Autenticação e usuários

O login usa usuário e senha, retorna um JWT Bearer com duração padrão de oito
horas e registra a sessão no banco. Senhas são armazenadas como hash scrypt com
salt individual. Logout revoga o token atual; trocar a senha revoga todos os
tokens do usuário. O login tem limite de tentativas malsucedidas por IP.

- **Administrador:** usa as operações do serviço e cria usuários.
- **Operador:** usa sessões, contatos, mensagens e agendamentos.

Todos compartilham um workspace. Não há isolamento por cliente/tenant. Para
integrações, crie um operador dedicado a cada aplicativo. Não há cadastro
público de usuários. Se precisar criar um usuário pelo terminal, defina
`CREATE_USER_USERNAME`, `CREATE_USER_PASSWORD`, `CREATE_USER_NAME` e,
opcionalmente, `CREATE_USER_ROLE=admin`; execute `npm run user:create`. Passe
segredos pelo ambiente local e evite colocá-los no histórico do shell.

## API para outros aplicativos

Base: `/api/v1`. O login é público; as demais operações exigem
`Authorization: Bearer <accessToken>`. `/health`, `/docs/` e `/openapi.json` são
públicos e não retornam dados das sessões. O contrato completo está no Swagger. Veja o [guia de integração](docs/integration.md)
com autenticação, ciclo de sessão por QR/código, todos os tipos, exemplos em Node.js/Python,
idempotência, limites, agendamento e tratamento de erros. Importe
`/openapi.json` no Postman ou Insomnia; cada tipo tem contrato e exemplo.

| Módulo       | Operações                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Acesso       | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password`                                                   |
| Usuários     | `GET/POST /auth/users` — administrador                                                                                                  |
| Sessões      | `GET/POST /sessions`, `GET/DELETE /sessions/:id`                                                                                        |
| Conexão      | `GET /sessions/:id/qr`, `GET /sessions/:id/pairing-code`, `POST /sessions/:id/connect`, `POST /sessions/:id/disconnect`                 |
| Agenda       | `GET /sessions/:id/directory`, `GET /sessions/:id/contacts`, `GET /sessions/:id/groups`, `GET /sessions/:id/channels`, `GET /directory` |
| Mensagens    | `POST /messages` ou `/messages/{tipo}`, `GET /messages`, `GET /messages/:id`                                                            |
| Agendamentos | `POST /schedules`, `GET /schedules`, `GET /schedules/:id`, `POST /schedules/:id/cancel`                                                 |

### Login e envio

```http
POST /api/v1/auth/login
Content-Type: application/json

{"username":"seu-app","password":"senha-da-integracao"}
```

A resposta contém `accessToken`, `tokenType`, `expiresIn` e `user`. Use o token
nas chamadas seguintes:

```http
POST /api/v1/messages
Authorization: Bearer SEU_TOKEN
Content-Type: application/json
Idempotency-Key: pedido-123-notificacao-1

{"sessionId":"comercial","to":"5511999999999","text":"Sua solicitação foi recebida."}
```

O destino aceita telefone com DDI, ID `@c.us`, ID privado `@lid` ou ID de grupo
`@g.us` ou canal `@newsletter` (com permissão de publicação). Use os IDs retornados pela agenda. Um `@lid` não é um telefone; sua
propriedade `number` será `null`. O texto aceita até 4.096 caracteres. Mídias usam base64 puro de até 16 MiB por
arquivo e JSON de até 24 MiB. O painel permite escolher o tipo de mensagem;
rotas específicas: `text`, `image`, `audio`, `voice`, `video`, `document`,
`sticker`, `location`, `contacts` e `poll`.

Enviar novamente com a mesma `Idempotency-Key`, usuário e payload retorna o
registro anterior, sem novo envio. Reutilizar a chave com outro payload retorna
`409`. Durante o envio original, a repetição retorna `202`; consulte
`GET /messages/:id`. A chave é opcional, mas recomendada para integrações.

```http
POST /api/v1/schedules
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{"sessionId":"comercial","to":"120363000000@g.us","text":"Lembrete","sendAt":"2030-10-15T15:00:00-03:00"}
```

Ajuste `sendAt` para uma data futura com `Z` ou offset. Todos os tipos de mensagem podem ser agendados. Agendamentos são de
execução única e podem ser criados com a sessão offline. Ao reconectar, os
pendentes vencidos são processados. O painel exibe os horários no fuso do
navegador; o banco usa `TIMESTAMPTZ`. `POST /schedules` ainda não tem
idempotência: repetir cria outro registro. Mídias pendentes ficam no banco até
a tentativa de envio/cancelamento; o histórico retorna apenas metadados.

### Respostas de enquetes

Use `GET /messages/:id/poll-results` para envios imediatos e
`GET /schedules/:id/poll-results` para enquetes agendadas já enviadas.
Informe o UUID do registro WappHub. Uma coleta nova exige sessão conectada
(`ready`); respostas já coletadas ficam salvas e podem ser consultadas offline.
Um job coleta votos a cada minuto, sem precisar abrir a janela de respostas.
Configure `poll.durationHours` (padrão 24h). As expiradas saem de **Enquetes** e
continuam no histórico, que oferece **Ver respostas da enquete**. A contagem usa
as seleções coletadas até o prazo. Após a expiração, os jobs deixam de coletar
votos e as consultas retornam somente dados salvos; a votação no chat não é bloqueada.
Veja o formato e os limites da consulta no [guia de integração](docs/integration.md#consultar-respostas-da-enquete).

### Consultas e estados

Listagens de contatos, grupos e históricos usam
`{data, total, limit, offset}`; `limit` vai de 1 a 500. Contatos e grupos aceitam
`search`, sem distinção de acentos ou maiúsculas. Históricos aceitam `sessionId`
e `status`; agendamentos também aceitam `order=asc|desc`.

No painel, **Histórico** e **Agendamentos** permitem combinar os filtros de
sessão e status. **Todas as sessões** reúne os registros; trocar um filtro
retorna à primeira página.

Os contatos são apenas os salvos na agenda, sem repetir o mesmo ID e sem incluir
o próprio número ou assistentes. Pessoas com nomes iguais e números diferentes
permanecem separadas. A consulta `directory` preserva resultados parciais e
retorna `warnings` quando contatos ou grupos estiverem indisponíveis.

| Estado      | Significado                                            |
| ----------- | ------------------------------------------------------ |
| `pending`   | Aguarda horário ou conexão.                            |
| `sending`   | Chamada de envio em andamento.                         |
| `submitted` | Possui ID, mas ainda não há confirmação do servidor.   |
| `sent`      | O servidor WhatsApp confirmou o envio.                 |
| `delivered` | O WhatsApp informou entrega ao dispositivo.            |
| `read`      | O WhatsApp informou leitura.                           |
| `played`    | O WhatsApp informou reprodução.                        |
| `failed`    | Falha anterior ao envio ou erro explícito do WhatsApp. |
| `unknown`   | Resultado incerto; confira antes de repetir.           |
| `cancelled` | Agendamento cancelado.                                 |

O acompanhamento usa ACKs persistidos e consulta de recuperação a cada 5 minutos
com a sessão conectada. O painel atualiza a lista e exibe as etapas com horários.
As respostas incluem `ack`, `submittedAt`, `sentAt`, `deliveredAt`, `readAt`,
`playedAt`, `lastAckAt` e `lastCheckedAt`. Os horários são os da observação pelo
WappHub. Leia o [guia de integração](docs/integration.md#5-idempotência-e-acompanhamento)
para a semântica completa. A ausência de confirmação de leitura não significa
que a pessoa não leu.

Use `POST /messages/:id/refresh-status` ou
`POST /schedules/:id/refresh-status` para consultar o WhatsApp sem reenviar.
Essas consultas exigem ID conhecido e sessão conectada. Mensagens antigas que
só possuíam um ID ficam `submitted` até receberem confirmação real.

Reinícios convertem envios interrompidos em `unknown`; eles não são reenviados
automaticamente. IDs de sessões removidas ficam reservados para preservar o
histórico. Desconectar preserva o perfil local; remover exclui esse perfil e
cancela agendamentos pendentes. O vínculo também pode ser revogado no celular.

Erros seguem `{error, message, requestId, details?}`. Respostas incluem
`X-Request-ID`. São usados `400` para validação, `401` para acesso inválido,
`403` para permissão, `404` para recurso ausente, `409` para conflito, `422`
para número não registrado, `429` para excesso de tentativas e `502` para falha
ou resultado incerto no WhatsApp. Em `SEND_UNCERTAIN`, `details.messageRecordId`
permite consultar o registro no histórico.

## Configuração e dados

As variáveis estão em `.env.example`. As principais são `DATABASE_URL`,
`JWT_SECRET`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`, `DATA_DIR`,
`JWT_TTL_SECONDS` e `CORS_ORIGINS`. O Compose monta a URL interna do banco com
`POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`; a URL local usa `127.0.0.1`.
Senhas de banco geradas pelo setup são hexadecimais para permitir composição
segura da URL. Se usar valores próprios, encode caracteres especiais na URL.

`TRUST_PROXY=true` é usado somente atrás do Nginx do Compose, que substitui os
cabeçalhos de encaminhamento. Na execução direta, o padrão é `false`.
O frontend não recebe segredos de banco, JWT ou bootstrap no build.

Para migrar uma instalação anterior com SQLite, pare a API antiga e execute:

```bash
npm run db:migrate
npm run db:import-sqlite
```

A importação lê `data/wapp.sqlite`, cria um backup, preserva o arquivo original
e importa sessões/agendamentos uma única vez, em transação. Um PostgreSQL já
preenchido com sessões não é sobrescrito. Use `SQLITE_IMPORT_PATH` para outro
arquivo. Os perfis locais em `data/auth` são preservados na execução local.
Para transferir esses perfis ao volume Docker, veja
[migração e operação](docs/operations.md).

Mantenha uma única API/worker de sessões por instalação. O modo local é o fluxo
de desenvolvimento; use os containers para validar o build ou implantar. Faça backup do banco e
dos perfis WhatsApp; somente um deles não basta para restaurar toda a central.

## Testes

```bash
npm run db:local:start
npm run check
CHROME_NO_SANDBOX=true npm run test:ui
git diff --check
```

Use `TEST_DATABASE_URL` apontando para um banco exclusivo de testes. Os testes
criam schemas isolados e verificam autenticação, permissões, revogação,
idempotência, concorrência, histórico, migração e agendamento. O teste de
navegador usa React, Express e PostgreSQL reais com cliente WhatsApp simulado;
não envia mensagens reais. O CI também compila os dois Dockerfiles. Para verificar imagens sem iniciar
containers, execute `docker compose build`.

Veja a [configuração de duas contas Git](docs/git-accounts.md). O estado dos alertas
transitivos do Puppeteer pode ser consultado com `npm audit`; não aplique
`--force` sem validar a integração com WhatsApp Web.
