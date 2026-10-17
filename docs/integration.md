# Integrar aplicativos com o WappHub

O WappHub fornece uma API REST para conectar sessões WhatsApp e enviar mensagens
imediatas ou agendadas. A base local é `http://127.0.0.1:3000/api/v1`.
O painel de desenvolvimento também encaminha a API em `http://127.0.0.1:5173`.

- Swagger executável: `/docs/`.
- Contrato importável em Postman/Insomnia: `/openapi.json`.
- Este guia no navegador: `/integration-guide`.

## 1. Criar uma conta de integração e autenticar

Um administrador cria um usuário com `POST /auth/users`. Use um operador
dedicado por aplicativo. Todos compartilham as sessões e os dados do mesmo
workspace; não há isolamento por cliente. Nenhuma credencial é publicada nos
exemplos. Guarde usuário/senha no backend do aplicativo integrador.

```http
POST /api/v1/auth/login
Content-Type: application/json

{"username":"meu-app","password":"SENHA_DA_INTEGRACAO"}
```

A resposta contém `accessToken`, `tokenType: "Bearer"`, `expiresIn` em segundos
e `user`. A validade padrão é 28.800 segundos (8 horas). Use o token em todas
as operações seguintes:

```http
Authorization: Bearer SEU_ACCESS_TOKEN
```

Renove o login ao expirar o token. `POST /auth/logout` revoga o token atual.
`POST /auth/change-password` revoga todos os tokens do usuário. `GET /auth/me`
consulta a conta autenticada. Não existe refresh token ou API key permanente.

## 2. Cadastrar e conectar uma sessão

```http
POST /api/v1/sessions
Authorization: Bearer SEU_ACCESS_TOKEN
Content-Type: application/json

{"id":"comercial","name":"Comercial"}
```

O ID aceita letras, números, `_` e `-`, até 64 caracteres. Consulte
`GET /sessions/comercial/qr`. A resposta contém `sessionId`, `status` e `qr`
(data URL PNG ou `null`). Exiba o QR em uma imagem e escaneie no WhatsApp em
**Aparelhos conectados**. Atualize a consulta enquanto aguarda o QR.

Consulte `GET /sessions/comercial` até `status: "ready"`. O cadastro registra
uma sessão de uma conta existente; não cria um novo número WhatsApp.

| Método | Rota                        | Uso                                               |
| ------ | --------------------------- | ------------------------------------------------- |
| GET    | `/sessions`                 | Listar sessões e estados.                         |
| GET    | `/sessions/{id}`            | Consultar uma sessão.                             |
| GET    | `/sessions/{id}/qr`         | Consultar QR e estado.                            |
| POST   | `/sessions/{id}/connect`    | Iniciar ou reconectar.                            |
| POST   | `/sessions/{id}/disconnect` | Parar e preservar autenticação.                   |
| DELETE | `/sessions/{id}`            | Remover perfil e cancelar agendamentos pendentes. |

IDs removidos ficam reservados para preservar o histórico. Não abra a mesma
pasta de perfil com duas instâncias do Chromium/Chrome.

## 3. Escolher o destino

| Método | Rota                       | Resposta                               |
| ------ | -------------------------- | -------------------------------------- |
| GET    | `/sessions/{id}/contacts`  | Contatos salvos e únicos por ID.       |
| GET    | `/sessions/{id}/groups`    | Grupos com seus IDs.                   |
| GET    | `/sessions/{id}/channels`  | Canais conhecidos pela sessão.         |
| GET    | `/sessions/{id}/directory` | Contatos e grupos com avisos parciais. |
| GET    | `/directory`               | Agenda das sessões cadastradas.        |

Contatos, grupos e canais aceitam `search`, `limit` (1 a 500, padrão 50) e
`offset` (padrão 0). Exemplo:
`GET /sessions/comercial/groups?search=operacoes&limit=20&offset=0`.
A busca ignora acentos e maiúsculas. A resposta paginada é
`{data, total, limit, offset}`. `directory` retorna listas sem paginação e
`warnings` em caso de falha parcial.

`to` aceita telefone com DDI (`5511999999999`, opcionalmente com `+`) ou ID
retornado pelo WhatsApp: `@c.us`, `@lid`, `@g.us` ou `@newsletter`.
Um LID não é um telefone: contatos privados podem ter `number: null`.

Para publicar em um canal, a conta precisa ter permissão de publicação. A
listagem de canais não comprova essa permissão. Nos canais, esta API permite
texto, imagem, voz, vídeo/GIF, figurinha e enquete; recusa documento,
localização, contatos, áudio comum, respostas, menções e visualização única.

## 4. Enviar mensagens

Use `POST /messages` com `type`, ou uma das rotas abaixo. Nas rotas específicas,
`type` pode ser omitido. Se informado, precisa corresponder à rota.
Todas exigem `sessionId`, `to` e os campos do tipo escolhido.

| Rota POST            | type       | Campos                                                                           |
| -------------------- | ---------- | -------------------------------------------------------------------------------- |
| `/messages/text`     | `text`     | `text` (1 a 4.096 caracteres, não vazio).                                        |
| `/messages/image`    | `image`    | `media`; opcionais `caption`, `viewOnce`, `hd`.                                  |
| `/messages/audio`    | `audio`    | `media` com MIME `audio/*`.                                                      |
| `/messages/voice`    | `voice`    | `media` com MIME `audio/*`, enviado como voz.                                    |
| `/messages/video`    | `video`    | `media`; opcionais `caption`, `viewOnce`, `asGif`.                               |
| `/messages/document` | `document` | `media`, com `filename` obrigatório; `caption` opcional.                         |
| `/messages/sticker`  | `sticker`  | `media`; opcionais `name`, `author`, `categories`.                               |
| `/messages/location` | `location` | `location` com latitude/longitude e nome/endereço/URL opcionais.                 |
| `/messages/contacts` | `contacts` | `contacts`: 1 a 20 IDs de usuário `@c.us`/`@lid`, sem repetições.                |
| `/messages/poll`     | `poll`     | `poll` com `name`, 2 a 12 `options` distintas e `allowMultipleAnswers` opcional. |

A rota genérica continua aceitando o formato legado
`{sessionId, to, text}`, sem `type`.
Botões e listas depreciados não são expostos. Recebimento, gestão de grupos,
bloqueios, reações, envio de votos em enquetes e comunidades estão fora deste escopo.
A consulta de respostas das enquetes enviadas está disponível.

### Texto

```http
POST /api/v1/messages/text
Authorization: Bearer SEU_ACCESS_TOKEN
Content-Type: application/json
Idempotency-Key: pedido-123-confirmacao

{"sessionId":"comercial","to":"5511999999999","text":"Pedido recebido."}
```

O mesmo envio com cURL, usando o token obtido no login:

```bash
curl --request POST http://127.0.0.1:3000/api/v1/messages/text \
  --header "Authorization: Bearer $WAPP_TOKEN" \
  --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: pedido-123-confirmacao' \
  --data '{"sessionId":"comercial","to":"5511999999999","text":"Pedido recebido."}'
```

Defina `WAPP_TOKEN` com o `accessToken` recebido. Reutilize a mesma chave ao
repetir a mesma operação; novas operações precisam de novas chaves.

### Imagem, áudio, voz, vídeo, documento e figurinha

`media` contém `mimetype`, `data` (base64 puro, sem `data:`) e `filename`
opcional, obrigatório para documentos. Até **16 MiB de bytes por arquivo** e
**24 MiB por JSON**. Não são aceitos URLs ou caminhos locais de arquivos.
O cliente deve enviar os bytes reais e declarar o MIME correto.
As legendas aceitam até 4.096 caracteres.

Exemplo em Node.js 24, sem dependências externas:

```js
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const base = process.env.WAPP_URL || "http://127.0.0.1:3000/api/v1";
const loginResponse = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: process.env.WAPP_USERNAME,
    password: process.env.WAPP_PASSWORD,
  }),
});
if (!loginResponse.ok) throw new Error(await loginResponse.text());
const { accessToken } = await loginResponse.json();

// Guarde a chave junto à operação no seu banco ANTES da primeira tentativa.
const key = randomUUID();
const payload = {
  sessionId: "comercial",
  to: "5511999999999",
  media: {
    mimetype: "application/pdf",
    filename: "comprovante.pdf",
    data: (await readFile("./comprovante.pdf")).toString("base64"),
  },
  caption: "Seu comprovante",
};
const response = await fetch(`${base}/messages/document`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Idempotency-Key": key,
  },
  body: JSON.stringify(payload),
});
const result = await response.json();
if (!response.ok) throw new Error(JSON.stringify(result));
console.log(result.id, result.status, result.messageId);
```

Para imagens use `image/png` ou `image/jpeg`; para áudio, por exemplo,
`audio/mpeg`. Prefira `audio/ogg` com codec Opus para voz. `voice` ativa
`sendAudioAsVoice`. `video` aceita `asGif: true` para enviar um vídeo como GIF;
não é um conversor de arquivos GIF. Vídeos dependem de Google Chrome com
codecs compatíveis. O Docker amd64 inclui Google Chrome; em ARM usa Chromium,
cujo suporte de vídeo precisa ser validado no ambiente.

Figurinhas aceitam `image/webp`, `image/png`, `image/jpeg` ou `video/mp4`.
Conversões animadas requerem FFmpeg instalado no host; a imagem Docker já o
inclui. `name` e `author` identificam o pacote, e `categories` recebe emojis.
O limite de 16 MiB é do WappHub; formatos, codecs, duração e limites adicionais do
WhatsApp podem impedir o envio mesmo que o JSON seja válido.

### Localização, contatos e enquete

Os exemplos abaixo são corpos para `POST /messages`:

```json
{
  "sessionId": "comercial",
  "to": "5511999999999",
  "type": "location",
  "location": {
    "latitude": -23.5505,
    "longitude": -46.6333,
    "name": "Ponto de encontro",
    "address": "São Paulo",
    "url": "https://example.com/local"
  }
}
```

Latitude vai de -90 a 90 e longitude de -180 a 180. `url` aceita HTTP/HTTPS.

```json
{
  "sessionId": "comercial",
  "to": "5511999999999",
  "type": "contacts",
  "contacts": ["5511888888888@c.us", "123456789@lid"]
}
```

Os cartões são resolvidos na sessão remetente. Não é um endpoint de criação de
contatos arbitrários ou importação de arquivos vCard.

```json
{
  "sessionId": "comercial",
  "to": "120363000000@g.us",
  "type": "poll",
  "poll": {
    "name": "Qual horário?",
    "options": ["Manhã", "Tarde"],
    "allowMultipleAnswers": false
  }
}
```

A pergunta aceita até 255 caracteres; cada opção aceita até 100. Opções que só
diferem por espaços nas pontas ou maiúsculas são consideradas repetidas.

### Consultar respostas da enquete

No painel, use **Enquetes** no menu lateral. A área reúne os envios imediatos e
os agendamentos, permite filtrar pela sessão e oferece **Ver respostas da enquete**.
O botão **Nova enquete** abre o formulário com o tipo Enquete selecionado.
As respostas também continuam acessíveis pelo Histórico e por Agendamentos.

Na API, `GET /polls` lista somente enquetes, com filtros `sessionId`, `limit` e
`offset`. Cada item informa `kind` (`messages` ou `schedules`), `recordId`,
`sessionId`, `to`, `poll`, `deliveryStatus`, `messageId`, `createdAt`, `startedAt`
e `sendAt`. `startedAt` indica quando o envio retornou um ID; a confirmação
continua sendo informada por `deliveryStatus`. Agendamentos ainda não enviados
não possuem respostas para consultar.

Depois de enviar a enquete, guarde o `id` retornado pelo WappHub e consulte:

```sh
curl "$BASE/messages/UUID_DO_REGISTRO/poll-results" \
  -H "Authorization: Bearer $TOKEN"
```

Para uma enquete agendada já enviada, use
`GET /schedules/UUID_DO_AGENDAMENTO/poll-results`. Ambas exigem JWT e sessão
`ready`. Os IDs dessas rotas são os UUIDs do WappHub, não o `messageId` WhatsApp.

Exemplo de resposta com múltiplas escolhas:

```json
{
  "recordId": "UUID_DO_REGISTRO",
  "sessionId": "comercial",
  "messageId": "ID_WHATSAPP",
  "name": "Qual horário?",
  "allowMultipleAnswers": true,
  "totalVoters": 1,
  "totalSelections": 2,
  "options": [
    { "id": 0, "name": "Manhã", "votes": 1, "voters": ["5511999999999@c.us"] },
    { "id": 1, "name": "Tarde", "votes": 1, "voters": ["5511999999999@c.us"] }
  ],
  "votes": [
    {
      "voter": "5511999999999@c.us",
      "selectedOptions": [
        { "id": 0, "name": "Manhã" },
        { "id": 1, "name": "Tarde" }
      ],
      "updatedAt": "2030-10-20T12:10:00.000Z"
    }
  ],
  "fetchedAt": "2030-10-20T12:11:00.000Z"
}
```

A consulta usa [getPollVotes](https://docs.wwebjs.dev/Client.html#getPollVotes)
e retorna as respostas disponíveis no histórico local do WhatsApp conectado.
O WappHub não armazena os votos; cada consulta busca um retrato atual. A mensagem
precisa estar disponível: se não estiver, a API responde `POLL_UNAVAILABLE`,
sem afirmar que não há votos. Mensagens de outros tipos geram `NOT_A_POLL`;
enquetes sem ID de envio geram `POLL_NOT_SENT`.

`totalVoters` conta participantes com pelo menos uma escolha ativa.
`totalSelections` soma escolhas e pode superar o número de participantes.
Cada participante aparece uma vez, com sua seleção mais recente.
Uma retirada de voto aparece com `selectedOptions: []` e não entra nos totais.
IDs de participante podem terminar em `@c.us` ou `@lid`; não os converta
automaticamente em números de telefone. `updatedAt` informa o horário retornado
pelo WhatsApp ou `null` se indisponível; `fetchedAt` é o horário da consulta.

No painel, abra **Histórico** ou **Agendamentos** e clique em
**Ver respostas da enquete**. A janela mostra totais e escolhas por participante,
com atualização automática a cada 15 segundos enquanto estiver aberta.

### Respostas e menções

Adicione `options` ao corpo da mensagem:

```json
{
  "replyTo": "false_120363000000@g.us_ID_DA_MENSAGEM",
  "mentions": ["5511888888888@c.us"],
  "groupMentions": [{ "id": "120363000001@g.us", "subject": "Equipe" }]
}
```

`replyTo` é o ID serializado do WhatsApp (`messageId` retornado pelo envio), e
não o UUID `id` do histórico WappHub. A mensagem citada precisa estar disponível
na sessão e pertencer à conversa de destino. Uma referência inválida retorna
`422 INVALID_REPLY` antes de enviar; a API não descarta silenciosamente a
citação. Como não há recebimento exposto nesta etapa, a API não lista IDs de
mensagens recebidas; respostas dependem de um ID já conhecido pela integração.

`mentions` recebe até 100 IDs de usuário; inclua `@numero` no texto/legenda para
indicar a posição da menção. `groupMentions` recebe até 20 objetos com ID e nome
do grupo. Use essas opções em tipos e conversas que as suportam no WhatsApp.

## 5. Idempotência e acompanhamento

Envie `Idempotency-Key` nos envios imediatos. A chave contém 1 a 128 caracteres
ASCII visíveis e identifica uma operação por usuário, compartilhada entre
`/messages` e `/messages/{tipo}`. Persista chave e payload no aplicativo chamador.

- `201`: nova operação registrada com ID WhatsApp. Isso, isoladamente, não
  confirma envio: verifique `status` e `ack` na resposta.
- `200`: registro de uma operação anterior com a mesma chave e conteúdo.
  Confira `status`: a operação anterior pode ter falhado ou ficar incerta.
- `202`: a operação original ainda está em andamento.
- `409 IDEMPOTENCY_CONFLICT`: mesma chave com conteúdo diferente.

A comparação considera tipo, conteúdo, bytes da mídia, legenda, destino e
opções. A ordem das propriedades JSON não muda a identidade. Não gere uma
chave nova ao repetir uma chamada que perdeu a conexão. Quando a API retorna
`SEND_UNCERTAIN`, `details.messageRecordId` aponta para o registro a consultar.

`GET /messages/{id}` consulta um registro. `GET /messages` lista o histórico,
com filtros `sessionId`, `status`, `limit` e `offset`. A resposta inclui `type`,
`content` (conteúdo/metadados), `text` (resumo para compatibilidade com o painel),
`status`, `messageId`, datas e erro. O base64 não aparece nas respostas nem é
armazenado no histórico imediato; mídia contém MIME, nome, tamanho e SHA-256.

| Estado      | Significado                                                          |
| ----------- | -------------------------------------------------------------------- |
| `pending`   | Agendamento aguardando horário ou conexão.                           |
| `sending`   | Chamada de envio em andamento, ainda sem resposta.                   |
| `submitted` | A sessão gerou um ID, mas falta confirmação do servidor.             |
| `sent`      | O servidor WhatsApp confirmou o envio (ACK 1). Não confirma entrega. |
| `delivered` | O WhatsApp informou entrega ao dispositivo (ACK 2).                  |
| `read`      | O WhatsApp informou leitura (ACK 3).                                 |
| `played`    | O WhatsApp informou reprodução (ACK 4).                              |
| `failed`    | Falha antes do envio ou erro explícito do WhatsApp (ACK -1).         |
| `unknown`   | A chamada terminou sem resultado confiável. Pode ter enviado.        |
| `cancelled` | Agendamento cancelado.                                               |

`ack` pode ser `null` (sem confirmação), `0` (pendente), `1` (servidor), `2`
(dispositivo), `3` (leitura), `4` (reprodução) ou `-1` (falha). Para considerar
envio confirmado, aceite `sent`, `delivered`, `read` ou `played`; para entrega
confirmada, aceite `delivered`, `read` ou `played`. Nunca use apenas o HTTP 201
ou a existência de `messageId` como confirmação de envio.

A resposta inclui `submittedAt`, `sentAt`, `deliveredAt`, `readAt`, `playedAt`,
`lastAckAt` e `lastCheckedAt`. Os horários registram quando o WappHub observou cada
etapa, não o horário exato em que ela ocorreu no aparelho remoto. Etapas ainda
não confirmadas retornam `null`. Um ACK de etapa superior também comprova as
anteriores; os horários observados podem coincidir.

A API escuta `message_ack`, persiste os recibos por sessão e ID WhatsApp e
consulta mensagens pendentes a cada 30 segundos enquanto a sessão está pronta.
Ao conectar, também dispara uma consulta de recuperação. Eventos atrasados não
rebaixam uma entrega/leitura já confirmada. Não são expostas confirmações
individuais de participantes de grupos nem estatísticas de audiência de canais.
Leitura e reprodução dependem das confirmações disponibilizadas pelo WhatsApp;
a ausência de confirmação não comprova ausência de leitura.

Consulte o estado salvo com `GET /messages/{id}` ou `GET /schedules/{id}`.
Para solicitar uma consulta direta ao WhatsApp, sem reenviar:

- `POST /messages/{id}/refresh-status`.
- `POST /schedules/{id}/refresh-status`.

Essas rotas exigem sessão `ready` e `messageId` conhecido. Se a mensagem não
estiver disponível na sessão, retornam `422 RECEIPT_UNAVAILABLE`, preservando o
estado anterior. Um envio sem ID retorna `409 NO_MESSAGE_RECEIPT`. A consulta
não cria outra mensagem e não tem efeito de retry.

Interrupções sem ID são recuperadas como `unknown`, sem reenvio automático.
Se uma chamada ultrapassar o timeout mas retornar depois no mesmo processo,
o resultado tardio atualiza o registro e associa o ID, sem outro envio. Uma
falha do banco depois da resposta do WhatsApp pode deixar `sending` até a
recuperação no reinício; `STATUS_PERSISTENCE_FAILED` inclui
`details.messageRecordId` e `details.whatsappMessageId`. Preserve a mesma chave
de idempotência e consulte o registro; não crie outra operação automaticamente.

Mensagens antigas gravadas como `sent` somente pela existência de ID passam a
aparecer como `submitted` até que um ACK seja observado. `sentAt` agora representa
confirmação do servidor; o instante anterior passa a aparecer em `submittedAt`.
Atualize integrações que antes tratavam todo ID como envio confirmado.

## 6. Agendar qualquer tipo

Use o mesmo corpo do envio genérico mais `sendAt`, uma data futura ISO 8601 com
`Z` ou offset:

```http
POST /api/v1/schedules
Authorization: Bearer SEU_ACCESS_TOKEN
Content-Type: application/json

{"sessionId":"comercial","to":"120363000000@g.us","type":"poll","poll":{"name":"Qual horário?","options":["Manhã","Tarde"]},"sendAt":"2030-10-20T09:00:00-03:00"}
```

Todos os dez tipos podem ser agendados. Cada agendamento executa uma vez. Uma
sessão offline aguarda conexão e então processa os pendentes vencidos.
O processo local precisa estar ligado para executar os envios.

O corpo necessário ao envio, incluindo base64, fica no PostgreSQL enquanto o
agendamento está pendente/em andamento. Ao concluir, falhar, cancelar ou marcar
como incerto na recuperação, a API remove esse corpo e mantém apenas o resumo.
Os backups do banco também podem conter mídias: proteja-os como dados privados.
Não existe endpoint de download de anexos nesta etapa.

- `GET /schedules`: filtros `sessionId`, `status`, `order=asc|desc`, `limit`, `offset`.
- `GET /schedules/{id}`: consultar um agendamento.
- `POST /schedules/{id}/cancel`: cancelar apenas se estiver `pending`.

**Agendamentos ainda não têm idempotência.** Repetir `POST /schedules` cria outro
registro. Guarde o ID retornado no aplicativo; em uma falha de conexão, confira
a listagem antes de repetir. `Idempotency-Key` vale apenas para envios imediatos.

## 7. Exemplo em Python

Python 3, somente biblioteca padrão. Configure `WAPP_USERNAME` e `WAPP_PASSWORD`
no ambiente local. O arquivo precisa existir no computador do integrador.

```python
import base64
import json
import os
import uuid
import urllib.request
from pathlib import Path

BASE = os.getenv("WAPP_URL", "http://127.0.0.1:3000/api/v1")

def post(path, payload, token=None, key=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if key:
        headers["Idempotency-Key"] = key
    request = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode(),
        headers=headers, method="POST",
    )
    with urllib.request.urlopen(request, timeout=240) as response:
        return json.load(response)

login = post("/auth/login", {
    "username": os.environ["WAPP_USERNAME"],
    "password": os.environ["WAPP_PASSWORD"],
})
# Persista esta chave junto à operação antes de enviar; reutilize em retries.
key = str(uuid.uuid4())
result = post("/messages/image", {
    "sessionId": "comercial",
    "to": "5511999999999",
    "media": {
        "mimetype": "image/png",
        "filename": "imagem.png",
        "data": base64.b64encode(Path("imagem.png").read_bytes()).decode(),
    },
    "caption": "Imagem da solicitação",
}, token=login["accessToken"], key=key)
print(result["id"], result["status"])
```

Em `urllib.error.HTTPError`, leia o corpo JSON para obter `error`, `message` e
`requestId`. Não faça retries cegos de envio ou de agendamento.

## 8. Erros e diagnóstico

Formato: `{error, message, requestId, details?}`. Todas as respostas incluem
`X-Request-ID`. Não exponha senhas, tokens, QR ou conteúdo das mensagens em logs
do aplicativo integrador.

| HTTP | Exemplos                                                                           | Ação                                                          |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`, `BAD_REQUEST`                                                  | Corrigir formato, limites, MIME ou base64.                    |
| 401  | Token inválido/expirado/revogado                                                   | Autenticar novamente.                                         |
| 403  | Operação exige administrador                                                       | Usar conta com permissão.                                     |
| 404  | `SESSION_NOT_FOUND`, `MESSAGE_NOT_FOUND`                                           | Conferir identificador.                                       |
| 409  | `SESSION_NOT_READY`, `SESSION_BUSY`, `IDEMPOTENCY_CONFLICT`                        | Conectar/aguardar ou revisar chave e payload.                 |
| 413  | `BAD_REQUEST`                                                                      | Reduzir JSON para até 24 MiB.                                 |
| 422  | `NUMBER_NOT_REGISTERED`, `INVALID_REPLY`, `INVALID_CONTACT`, `RECEIPT_UNAVAILABLE` | Corrigir destinatário, citação ou cartão.                     |
| 429  | Excesso de tentativas de login                                                     | Aguardar antes de autenticar de novo.                         |
| 500  | `INTERNAL_ERROR`                                                                   | Preservar a chave; consultar histórico e logs pelo requestId. |
| 502  | `SEND_UNCERTAIN`, `MESSAGE_PREPARATION_FAILED`, falha da agenda                    | Conferir histórico; unknown não autoriza novo envio.          |
| 504  | `WHATSAPP_TIMEOUT` antes de enviar                                                 | Verificar conexão da sessão.                                  |

`GET /health` verifica HTTP e PostgreSQL. Para verificar WhatsApp, consulte o
estado de cada sessão. Execute uma única API/worker por banco/schema.
O WappHub usa whatsapp-web.js, uma integração não oficial e sujeita a alterações
no WhatsApp Web. Não há garantia contra bloqueios. O cliente simulado dos
testes valida contratos e persistência; formatos e codecs também precisam de
uma validação real com destinatários de teste autorizados.

Referências: [Client.sendMessage](https://docs.wwebjs.dev/Client.html#sendMessage),
[MessageSendOptions](https://docs.wwebjs.dev/global.html#MessageSendOptions),
[MessageMedia](https://docs.wwebjs.dev/MessageMedia.html),
[Location](https://docs.wwebjs.dev/Location.html) e
[Poll](https://docs.wwebjs.dev/Poll.html).
