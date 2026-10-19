# Executar e integrar o WappHub com Docker

Este guia cobre uma instalação nova: configuração, subida dos serviços,
primeiro acesso e integração pela API. Para levar dados de uma instalação local
existente ao Docker, siga a [migração e operação](operations.md).

O projeto fornece Dockerfiles e Compose para construir as imagens a partir do
código. O fluxo abaixo não depende de uma imagem pré-publicada em um registry.

Para a primeira instalação, siga [preparação](#1-preparar-a-configuração),
[variáveis](#2-configurar-as-variáveis-de-ambiente),
[subida](#3-construir-e-subir) e [primeiro acesso](#4-entrar-e-vincular-o-whatsapp).
Para conectar outro sistema, consulte [integração](#5-integrar-outro-aplicativo).

## Serviços e persistência

| Serviço | Função                                          | Acesso no Compose padrão                                        |
| ------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `web`   | Nginx, painel React e proxy para a API.         | `http://127.0.0.1:3000` no host.                                |
| `api`   | Express, autenticação, sessões WhatsApp e jobs. | `http://api:3000` na rede interna; sem porta publicada no host. |
| `db`    | PostgreSQL 17.                                  | `db:5432` internamente e `127.0.0.1:5432` no host.              |

O volume `postgres-data` guarda usuários, mensagens, agendamentos e recibos de
entrega. O volume `whatsapp-data` guarda os perfis autenticados do WhatsApp e o
cache do navegador em `/app/data`. Ambos precisam ser preservados.

O Compose usa o nome de projeto `wapp`, declarado em `compose.yaml`. Por padrão,
os volumes são `wapp_postgres-data` e `wapp_whatsapp-data`. Alterar o nome do
projeto cria outro conjunto de recursos: não faça essa troca esperando reutilizar
automaticamente os dados anteriores.

Execute uma única instância da API por banco/schema. O processo mantém o
navegador das sessões e os jobs de envio; um lock no PostgreSQL impede outro
worker no mesmo schema. Não compartilhe o mesmo perfil entre API local e Docker.

## 1. Preparar a configuração

Instale Git e Docker com o plugin Compose. Confira se o daemon está disponível:

```bash
docker version
docker compose version
git clone https://github.com/Gabriel-Donizetti/wapp-bot.git
cd wapp-bot
```

Se tiver Node.js 24 no host, gere a configuração com:

```bash
node scripts/setup.mjs
```

Em Linux/macOS, também é possível executar o mesmo script com Node em um
container temporário, sem instalar Node no host:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:24-bookworm-slim node scripts/setup.mjs
```

Use apenas uma dessas opções. Não é necessário executar `npm ci` no host para
subir o Compose. O script usa apenas módulos internos do Node e cria:

- `.env`, com senha aleatória do banco, segredo JWT e credencial inicial.
- `data/initial-admin.txt`, com usuário e senha do primeiro acesso no host.

Se `.env` já existir, o script o preserva e não gera outra configuração nem
credencial. Confira as variáveis necessárias na próxima seção. Não substitua
o `.env` de uma instalação existente pelo exemplo.

Para configuração manual, copie `.env.example` para `.env` em uma instalação
nova e preencha `POSTGRES_PASSWORD`, `JWT_SECRET` e os dados de bootstrap.
`data/initial-admin.txt` só é criado pelo script, não pelo Compose.

## 2. Configurar as variáveis de ambiente

O `.env` da raiz fornece valores para a interpolação do Compose. Ele não é
enviado integralmente aos containers: só os valores referenciados em
`compose.yaml` entram na configuração dos serviços. Variáveis exportadas no
shell podem substituir as do `.env`. Veja a
[precedência de variáveis no Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/).

### Valores usados pelo Compose

| Variável                   | Padrão ou requisito                                    | Efeito                                                                                                                           |
| -------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_DB`              | `wapp`                                                 | Nome do banco criado na primeira inicialização.                                                                                  |
| `POSTGRES_USER`            | `wapp`                                                 | Usuário do PostgreSQL.                                                                                                           |
| `POSTGRES_PASSWORD`        | Obrigatória e não vazia.                               | Senha usada pelo PostgreSQL e pela URL interna da API.                                                                           |
| `POSTGRES_PORT`            | `5432`                                                 | Porta do banco publicada somente em `127.0.0.1` no host.                                                                         |
| `JWT_SECRET`               | Obrigatória; pelo menos 32 caracteres.                 | Assina os tokens de acesso da API.                                                                                               |
| `JWT_TTL_SECONDS`          | `28800` (8 horas); de `60` a `86400`.                  | Validade dos JWTs emitidos.                                                                                                      |
| `BOOTSTRAP_ADMIN_USERNAME` | `admin`                                                | Primeiro administrador, criado somente se não houver usuários. Use de 3 a 64 letras minúsculas, números, `_`, `.` ou `-`.        |
| `BOOTSTRAP_ADMIN_PASSWORD` | Necessária no primeiro acesso; de 12 a 128 caracteres. | Senha do primeiro administrador. Não redefine um usuário existente.                                                              |
| `WEB_PORT`                 | `3000`                                                 | Porta do painel, API e documentação, publicada em `127.0.0.1`.                                                                   |
| `CORS_ORIGINS`             | Valor do `.env`; vazio se ausente.                     | Origens de outros frontends autorizadas, separadas por vírgula. Use origem completa, sem caminho: `https://meu-app.exemplo.com`. |

O script gera a senha do banco em hexadecimal. Mantenha esse formato simples se
a configurar manualmente: o Compose monta `DATABASE_URL` diretamente com essa
senha, sem escapar caracteres especiais de URLs ou da interpolação.

Em um volume de banco já inicializado, mudar `POSTGRES_PASSWORD`,
`POSTGRES_USER` ou `POSTGRES_DB` no `.env` não altera os usuários e bancos que
existem no PostgreSQL. Planeje a alteração no banco antes de mudar a conexão da
API. Também não troque `JWT_SECRET` a cada reinício: a troca invalida os JWTs
anteriores.

### Valores fixados para a API no Compose

Estes valores são definidos em `compose.yaml` ou no Dockerfile. Alterar a chave
homônima no `.env` local não muda o container com o Compose atual.

| Variável                 | Valor no container                         | Motivo                                                                     |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------------------------- |
| `NODE_ENV`               | `production`                               | Executar a versão compilada.                                               |
| `HOST`                   | `0.0.0.0`                                  | Escutar na interface interna do container.                                 |
| `PORT`                   | `3000`                                     | Porta interna da API; use `WEB_PORT` para o acesso pelo host.              |
| `DATABASE_URL`           | `postgresql://USUARIO:SENHA@db:5432/BANCO` | URL montada com as variáveis `POSTGRES_*`. O host é `db`, não `localhost`. |
| `DATA_DIR`               | `/app/data`                                | Caminho coberto pelo volume de perfis WhatsApp.                            |
| `TRUST_PROXY`            | `true`                                     | API atrás do Nginx do serviço `web`.                                       |
| `CHROME_EXECUTABLE_PATH` | `/usr/local/bin/wapp-chrome`               | Navegador instalado na imagem.                                             |
| `CHROME_NO_SANDBOX`      | `true`                                     | Configuração usada pelo navegador no container.                            |

A imagem amd64 instala Google Chrome; outras arquiteturas usam Chromium. Vídeos
dependem dos codecs disponíveis, especialmente em ARM. FFmpeg já faz parte da
imagem. Não é necessário instalar navegador no host.

### Outras variáveis do `.env.example`

| Variável                | Aplicação                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCHEDULER_INTERVAL_MS` | Padrão da API: `5000`, mínimo `1000`. Intervalo de verificação dos agendamentos. O Compose atual não repassa essa chave do `.env`; usa o padrão da API. Para alterá-la em Docker, adicione-a ao `environment` de `api`. |
| `TEST_DATABASE_URL`     | Banco exclusivo dos testes locais/CI; não é usado pelos serviços do Compose.                                                                                                                                            |
| `LOCAL_POSTGRES_BIN`    | Caminho de `pg_ctl`/`initdb` para o helper de banco local; não é usado em Docker.                                                                                                                                       |

O monitor de confirmações de entrega usa um intervalo de cinco minutos, definido
no código. `SCHEDULER_INTERVAL_MS` controla outro job e não altera esse monitor.
ACKs continuam atualizando os recibos em tempo real. A listagem de sessões também
verifica se a comunicação com o navegador permanece disponível.

Depois de mudar uma variável usada pelo Compose, recrie o serviço para aplicar
o novo ambiente:

```bash
docker compose up -d --wait
```

`docker compose restart` reinicia o processo com o ambiente anterior. Se quiser
usar outro arquivo de configuração, passe `--env-file CAMINHO` em todos os
comandos Compose daquela instalação.

## 3. Construir e subir

Valide o arquivo sem imprimir os segredos interpolados e inicie os serviços:

```bash
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
curl --fail http://127.0.0.1:3000/health
```

O build instala as dependências e compila API e painel. Na inicialização, a API
aplica as migrations, cria o primeiro administrador se necessário e restaura as
sessões cadastradas. Não é necessário rodar `db:migrate` separadamente nesse
fluxo. O healthcheck confirma HTTP e banco; acompanhe os estados das sessões para
saber se o WhatsApp está conectado.

Se a porta 3000 ou 5432 já estiver ocupada, ajuste `WEB_PORT` ou `POSTGRES_PORT`
antes de subir. Por exemplo:

```dotenv
WEB_PORT=8080
POSTGRES_PORT=5434
```

Nesse exemplo, o acesso passa a ser `http://127.0.0.1:8080`. O PostgreSQL continua
em `db:5432` dentro da rede e a API continua em `api:3000`. Não rode a instalação
local e o container usando o mesmo banco ou os mesmos perfis.

## 4. Entrar e vincular o WhatsApp

No padrão de portas:

| Recurso             | Endereço                                  |
| ------------------- | ----------------------------------------- |
| Painel              | `http://127.0.0.1:3000`                   |
| API                 | `http://127.0.0.1:3000/api/v1`            |
| Swagger             | `http://127.0.0.1:3000/docs/`             |
| OpenAPI             | `http://127.0.0.1:3000/openapi.json`      |
| Guia de integração  | `http://127.0.0.1:3000/integration-guide` |
| Saúde de HTTP/banco | `http://127.0.0.1:3000/health`            |

1. Consulte `data/initial-admin.txt` localmente e entre no painel.
2. Altere a senha em **Minha conta**. Remova o valor de
   `BOOTSTRAP_ADMIN_PASSWORD` do `.env`, exclua o arquivo de credenciais e
   execute `docker compose up -d --wait` para atualizar o ambiente da API.
3. Em **Sessões → Nova sessão**, informe nome e identificador.
4. Escolha QR Code ou código com número de telefone e confirme no WhatsApp do
   celular. Para código, informe o número com DDI.
5. Aguarde **Conectada** (`ready`) antes de enviar mensagens ou consultar a agenda.

Após reiniciar com os volumes preservados, um vínculo ainda válido pode ser
restaurado sem repetir a autenticação. Códigos de vinculação pendentes ficam
apenas em memória; nesse caso, escolha novamente o método por código após o
reinício. Veja o [diagnóstico de vinculação](operations.md#vinculação-por-qr-ou-código).

## 5. Integrar outro aplicativo

Crie no painel um usuário **Operador** dedicado ao aplicativo. Todos os usuários
compartilham o mesmo workspace e as mesmas sessões; não há isolamento por cliente.
Faça o login pelo backend do aplicativo:

```http
POST /api/v1/auth/login
Content-Type: application/json

{"username":"meu-app","password":"SENHA_DO_OPERADOR"}
```

Use o `accessToken` retornado como Bearer nas próximas requisições. Por exemplo,
para enviar texto por uma sessão já conectada:

```http
POST /api/v1/messages/text
Authorization: Bearer SEU_ACCESS_TOKEN
Content-Type: application/json
Idempotency-Key: pedido-123-confirmacao-v1

{"sessionId":"comercial","to":"5511999999999","text":"Seu pedido foi confirmado."}
```

Guarde o `id` retornado e consulte `GET /api/v1/messages/{id}` para acompanhar a
entrega. Um HTTP 201 não comprova entrega. Para repetir uma requisição incerta,
preserve usuário, chave de idempotência e payload; não gere outra chave para o
mesmo envio.

Escolha a URL conforme onde seu aplicativo roda:

| Origem do aplicativo            | Base da API                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Backend no mesmo host           | `http://127.0.0.1:WEB_PORT/api/v1` — substitua `WEB_PORT` pelo valor numérico.                                     |
| Container na mesma rede Compose | `http://api:3000/api/v1`. A rede padrão é `wapp_default`; conecte o outro serviço a essa rede para resolver `api`. |
| Outra máquina                   | URL HTTPS de um proxy que encaminhe ao serviço `web`. O Compose padrão publica apenas em loopback.                 |

Dentro de outro container, `127.0.0.1` aponta para aquele próprio container.
`CORS_ORIGINS` só é necessário para outro frontend que faça chamadas pelo
navegador; não substitui autenticação e não é exigido para chamadas entre
backends. O painel do WappHub usa a API pela mesma origem do Nginx.

Para acesso externo, mantenha a API e o banco internos e configure um proxy com
HTTPS para o `web`. Alterar apenas `WEB_PORT` não abre acesso por outra máquina.
O frontend já usa URLs relativas, sem exigir uma variável de URL da API no build.

O [guia de integração](integration.md) explica cadastro por API, QR/código,
destinatários, os dez tipos de mensagem, enquetes, agendamentos, status e erros.

## Operar, atualizar e diagnosticar

```bash
docker compose ps
docker compose logs --tail 100 api
docker compose logs --tail 100 web
docker compose logs --tail 100 db
```

Após obter uma versão desejada do código, reconstrua e recrie os serviços:

```bash
docker compose up -d --build --wait
```

Preserve `.env` e volumes nas atualizações. Antes de uma atualização com
migrations, faça o [backup do banco e dos perfis](operations.md#backups).
Para parar temporariamente, use `docker compose stop`; para remover os containers
e a rede preservando os volumes, use `docker compose down`. A opção `down -v`
exclui os volumes e seus dados.

| Sintoma                                                | Verificação                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Compose pede `POSTGRES_PASSWORD` ou `JWT_SECRET`.      | Confira `.env`, diretório de execução e variáveis exportadas no shell.                                 |
| Porta já em uso.                                       | Ajuste `WEB_PORT`/`POSTGRES_PORT` ou pare o serviço que ocupa a porta.                                 |
| Banco sem usuários impede iniciar a API.               | Configure usuário e senha de bootstrap; a senha precisa ter 12 a 128 caracteres.                       |
| Login antigo continua após alterar bootstrap.          | Bootstrap não redefine usuários. Troque a senha em **Minha conta**.                                    |
| Falha de autenticação no PostgreSQL após mudar `.env`. | A senha/usuário do volume existente não muda com o `.env`. Confira o banco antes de alterar a conexão. |
| API parece sem dados após trocar o nome do projeto.    | Confira se está usando os mesmos volumes e nome de projeto da instalação.                              |
| `/health` funciona, mas não envia.                     | Consulte a sessão, aguarde `ready` e confira os logs de `api`.                                         |
| Sessão fica em erro ou pede QR após reiniciar.         | Confira persistência de `whatsapp-data` e validade do vínculo no WhatsApp. Use **Reconectar**.         |
| Outra instância da API já ativa.                       | Pare a instância anterior que usa o mesmo banco/schema; não escale `api` com este modelo.              |
| Outro navegador bloqueia a chamada por CORS.           | Configure a origem exata em `CORS_ORIGINS` e recrie a API.                                             |

Evite compartilhar a saída completa de `docker compose config`, pois ela contém
segredos resolvidos. Use `config --quiet` para validar. A referência do comando
está na [documentação do Docker](https://docs.docker.com/reference/cli/docker/compose/config/).
