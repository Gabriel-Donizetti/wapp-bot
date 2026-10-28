import { z } from "zod";
import {
  messageBodySchema,
  scheduleBodySchema,
  messageTypes,
  MAX_MEDIA_BYTES,
} from "../shared/validation.js";
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const body = (schema: object) => ({ required: true, content: json(schema) });
const response = (schema: object, description = "Sucesso") => ({
  description,
  content: json(schema),
});
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });
const string = { type: "string" };
const pairingPhoneNumber = {
  type: "string",
  pattern: "^\\+?[1-9]\\d{7,14}$",
  description:
    "Opcional. Número com DDI para vincular por código em vez de QR. A confirmação é feita no WhatsApp do celular.",
  example: "5511999999999",
};
const id = { name: "id", in: "path", required: true, schema: string };
const query = (name: string, type = "string") => ({
  name,
  in: "query",
  schema: { type },
});
const paging = [query("limit", "integer"), query("offset", "integer")];
const errors = {
  400: response(ref("Error"), "Dados inválidos"),
  413: response(ref("Error"), "JSON acima de 24 MiB"),
  500: response(
    ref("Error"),
    "Falha interna; preserve a chave de idempotência",
  ),
  504: response(ref("Error"), "Tempo excedido antes do envio"),
  401: response(ref("Error"), "Autenticação necessária"),
  403: response(ref("Error"), "Sem permissão"),
  404: response(ref("Error"), "Recurso não encontrado"),
  409: response(ref("Error"), "Conflito"),
  422: response(ref("Error"), "Destinatário não encontrado"),
  429: response(ref("Error"), "Muitas tentativas"),
  502: response(ref("Error"), "Falha ou resultado incerto no WhatsApp"),
};
const operation = (
  tag: string,
  summary: string,
  schema: object,
  extra: object = {},
) => ({
  tags: [tag],
  summary,
  security: [{ bearerAuth: [] }],
  responses: { 200: response(schema), ...errors },
  ...extra,
});
const messageInput = z.toJSONSchema(messageBodySchema, {
  target: "openapi-3.0",
  io: "input",
});
const variants = messageInput.oneOf ?? messageInput.anyOf ?? [];
const legacyTextInput = structuredClone(variants[0]!);
if (legacyTextInput.properties) delete legacyTextInput.properties.type;
legacyTextInput.required = legacyTextInput.required?.filter(
  (key) => key !== "type",
);
const sendInput = {
  oneOf: [legacyTextInput, ...variants],
  description:
    "Use type para escolher o formato. Sem type, aceita texto no formato legado. Mídias: base64 puro, até 16 MiB por arquivo; JSON até 24 MiB. Não aceita URL nem caminho local de arquivo.",
};
const typedScheduleInput = z.toJSONSchema(scheduleBodySchema, {
  target: "openapi-3.0",
  io: "input",
});
const legacyScheduleInput = structuredClone(legacyTextInput);
legacyScheduleInput.properties = {
  ...legacyScheduleInput.properties,
  sendAt: { type: "string", format: "date-time" },
};
legacyScheduleInput.required = [
  ...(legacyScheduleInput.required ?? []),
  "sendAt",
];
const scheduleInput = { oneOf: [legacyScheduleInput, typedScheduleInput] };
const previewInput = {
  oneOf: variants.map((variant) => {
    const schema = structuredClone(variant);
    if (schema.properties) {
      delete schema.properties.sessionId;
      delete schema.properties.to;
      delete schema.properties.sendAt;
      if (
        schema.properties.media &&
        typeof schema.properties.media === "object" &&
        "properties" in schema.properties.media
      ) {
        const media = schema.properties.media;
        if (media.properties) {
          delete media.properties.data;
          media.properties.size = {
            type: "integer",
            minimum: 1,
            maximum: MAX_MEDIA_BYTES,
          };
          media.properties.sha256 = {
            type: "string",
            pattern: "^[a-f0-9]{64}$",
          };
          media.required = ["mimetype", "size", "sha256"];
        }
      }
    }
    schema.required = schema.required?.filter(
      (key) => !["sessionId", "to", "sendAt"].includes(key),
    );
    return schema;
  }),
};
const idempotencyHeader = {
  name: "Idempotency-Key",
  in: "header",
  schema: { type: "string", maxLength: 128, pattern: "^[!-~]{1,128}$" },
  description:
    "Chave única da operação por usuário. Repetições do mesmo conteúdo retornam o registro anterior, inclusive entre a rota genérica e as rotas por tipo.",
};
const sendingResponses = {
  201: response(
    ref("Message"),
    "Operação registrada; consulte status e ack para saber se o envio foi confirmado",
  ),
  200: response(
    ref("Message"),
    "Estado atual da operação anterior com a mesma chave; pode ainda estar sem confirmação ou ter falhado",
  ),
  202: response(
    ref("Message"),
    "Envio original ainda em andamento; consulte GET /messages/{id}",
  ),
  ...errors,
};
const exampleBase = { sessionId: "comercial", to: "5511999999999" };
const examples: Record<string, object> = {
  text: { ...exampleBase, text: "Sua solicitação foi recebida." },
  image: {
    ...exampleBase,
    media: {
      mimetype: "image/png",
      data: "BASE64_DO_ARQUIVO",
      filename: "imagem.png",
    },
    caption: "Imagem da solicitação",
  },
  audio: {
    ...exampleBase,
    media: {
      mimetype: "audio/mpeg",
      data: "BASE64_DO_ARQUIVO",
      filename: "audio.mp3",
    },
  },
  voice: {
    ...exampleBase,
    media: {
      mimetype: "audio/ogg",
      data: "BASE64_DO_ARQUIVO",
      filename: "voz.ogg",
    },
  },
  video: {
    ...exampleBase,
    media: {
      mimetype: "video/mp4",
      data: "BASE64_DO_ARQUIVO",
      filename: "video.mp4",
    },
    caption: "Demonstração",
    asGif: false,
  },
  document: {
    ...exampleBase,
    media: {
      mimetype: "application/pdf",
      data: "BASE64_DO_ARQUIVO",
      filename: "comprovante.pdf",
    },
  },
  sticker: {
    ...exampleBase,
    media: {
      mimetype: "image/webp",
      data: "BASE64_DO_ARQUIVO",
      filename: "figurinha.webp",
    },
    name: "WappHub",
    author: "Minha integração",
  },
  location: {
    ...exampleBase,
    location: {
      latitude: -23.5505,
      longitude: -46.6333,
      name: "Ponto de encontro",
      address: "São Paulo",
    },
  },
  contacts: { ...exampleBase, contacts: ["5511999999999@c.us"] },
  poll: {
    ...exampleBase,
    poll: {
      name: "Qual horário?",
      options: ["Manhã", "Tarde"],
      allowMultipleAnswers: false,
      durationHours: 24,
    },
  },
};
const typedSendPaths = Object.fromEntries(
  messageTypes.map((type) => {
    const variant = variants.find(
      (item) =>
        item.properties?.type &&
        typeof item.properties.type === "object" &&
        "enum" in item.properties.type &&
        item.properties.type.enum?.includes(type),
    );
    const schema = structuredClone(variant ?? {});
    schema.required = schema.required?.filter((key) => key !== "type");
    return [
      `/messages/${type}`,
      {
        post: operation("Mensagens", `Enviar ${type}`, ref("Message"), {
          operationId: `send${type[0]!.toUpperCase()}${type.slice(1)}`,
          description:
            "O tipo é definido pela rota. Aceita o mesmo payload e opções da rota genérica. A mesma chave de idempotência é compartilhada entre rotas. BASE64_DO_ARQUIVO é um marcador: substitua pelo conteúdo real do arquivo.",
          parameters: [idempotencyHeader],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema, example: examples[type] },
            },
          },
          responses: sendingResponses,
        }),
      },
    ];
  }),
);
const receiptProperties = {
  ack: {
    type: "integer",
    nullable: true,
    enum: [-1, 0, 1, 2, 3, 4, null],
    description:
      "ACK observado: -1 falha, 0 pendente, 1 servidor, 2 dispositivo, 3 leitura, 4 reprodução. null significa ausência de confirmação.",
  },
  submittedAt: {
    type: "string",
    format: "date-time",
    nullable: true,
    description: "Quando a biblioteca retornou o ID; não confirma envio.",
  },
  sentAt: {
    type: "string",
    format: "date-time",
    nullable: true,
    description: "Primeira observação de ACK de servidor ou superior.",
  },
  deliveredAt: { type: "string", format: "date-time", nullable: true },
  readAt: { type: "string", format: "date-time", nullable: true },
  playedAt: { type: "string", format: "date-time", nullable: true },
  lastAckAt: { type: "string", format: "date-time", nullable: true },
  lastCheckedAt: { type: "string", format: "date-time", nullable: true },
};
const userInput = object(
  {
    username: { type: "string", pattern: "^[a-z0-9_.-]{3,64}$" },
    name: string,
    password: {
      type: "string",
      minLength: 12,
      maxLength: 128,
      writeOnly: true,
    },
    role: { type: "string", enum: ["admin", "operator"], default: "operator" },
  },
  ["username", "name", "password"],
);
const page = (name: string) =>
  object({
    data: { type: "array", items: ref(name) },
    total: { type: "integer" },
    limit: { type: "integer" },
    offset: { type: "integer" },
  });
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "WappHub API",
    version: "1.1.0",
    description:
      "API de um workspace compartilhado para usuários e aplicativos autenticados. Dez tipos de envio, respostas, menções, sessões WhatsApp, contatos, grupos, canais e agendamento. Guia de integração: /integration-guide. Mídias em base64 até 16 MiB; requisições até 24 MiB. O uso de whatsapp-web.js não oferece garantia contra bloqueio.",
  },
  externalDocs: {
    description: "Guia completo de integração",
    url: "/integration-guide",
  },
  servers: [{ url: "/api/v1" }],
  tags: [
    "Autenticação",
    "Usuários",
    "Sessões",
    "Mensagens",
    "Agendamentos",
  ].map((name) => ({ name })),
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: object(
        {
          error: string,
          message: string,
          requestId: string,
          details: { type: "object", additionalProperties: true },
        },
        ["error", "message"],
      ),
      User: object({
        id: { type: "string", format: "uuid" },
        username: string,
        name: string,
        role: { type: "string", enum: ["admin", "operator"] },
        active: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
      }),
      Session: object({
        id: string,
        name: string,
        status: {
          type: "string",
          enum: [
            "starting",
            "qr",
            "pairing",
            "authenticated",
            "ready",
            "disconnected",
            "error",
          ],
        },
        phone: { type: "string", nullable: true },
        error: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
      }),
      Contact: object({
        id: string,
        name: { type: "string", nullable: true },
        number: { type: "string", nullable: true },
        isMyContact: { type: "boolean" },
      }),
      Group: object({ id: string, name: string }),
      Directory: object({
        sessionId: string,
        contacts: { type: "array", items: ref("Contact") },
        groups: { type: "array", items: ref("Group") },
        warnings: {
          type: "array",
          items: object({ source: string, message: string }),
        },
      }),
      PollOverview: object({
        kind: { type: "string", enum: ["messages", "schedules"] },
        recordId: { type: "string", format: "uuid" },
        sessionId: string,
        to: string,
        poll: object(
          {
            name: string,
            options: { type: "array", items: string },
            allowMultipleAnswers: { type: "boolean" },
            durationHours: {
              type: "number",
              minimum: 1,
              maximum: 720,
              default: 24,
            },
          },
          ["name", "options"],
        ),
        createdAt: { type: "string", format: "date-time" },
        startedAt: { type: "string", format: "date-time", nullable: true },
        sendAt: { type: "string", format: "date-time", nullable: true },
        messageId: { type: "string", nullable: true },
        deliveryStatus: string,
        expiresAt: { type: "string", format: "date-time", nullable: true },
        expired: { type: "boolean" },
      }),
      PollResults: object({
        recordId: { type: "string", format: "uuid" },
        sessionId: string,
        messageId: string,
        name: string,
        allowMultipleAnswers: { type: "boolean" },
        totalVoters: { type: "integer" },
        totalSelections: { type: "integer" },
        options: {
          type: "array",
          items: object({
            id: { type: "integer" },
            name: string,
            votes: { type: "integer" },
            voters: { type: "array", items: string },
          }),
        },
        votes: {
          type: "array",
          items: object({
            voter: string,
            selectedOptions: {
              type: "array",
              items: object({ id: { type: "integer" }, name: string }),
            },
            updatedAt: { type: "string", format: "date-time", nullable: true },
          }),
        },
        fetchedAt: { type: "string", format: "date-time" },
        expiresAt: { type: "string", format: "date-time" },
        expired: { type: "boolean" },
        source: { type: "string", enum: ["whatsapp", "stored"] },
        syncedAt: { type: "string", format: "date-time", nullable: true },
        warning: { type: "string", nullable: true },
      }),
      SendMessage: sendInput,
      ScheduleInput: scheduleInput,
      MessageContent: previewInput,
      Message: object({
        id: { type: "string", format: "uuid" },
        sessionId: string,
        to: string,
        text: string,
        type: { type: "string", enum: [...messageTypes] },
        content: ref("MessageContent"),
        status: {
          type: "string",
          enum: [
            "sending",
            "submitted",
            "sent",
            "delivered",
            "read",
            "played",
            "failed",
            "unknown",
          ],
        },
        messageId: { type: "string", nullable: true },
        error: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        ...receiptProperties,
      }),
      Schedule: object({
        id: { type: "string", format: "uuid" },
        sessionId: string,
        to: string,
        text: string,
        type: { type: "string", enum: [...messageTypes] },
        content: ref("MessageContent"),
        sendAt: { type: "string", format: "date-time" },
        status: {
          type: "string",
          enum: [
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
          ],
        },
        messageId: { type: "string", nullable: true },
        error: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        ...receiptProperties,
      }),
    },
  },
  paths: {
    "/auth/login": {
      post: operation(
        "Autenticação",
        "Entrar e obter JWT válido por 8 horas (padrão)",
        object({
          accessToken: string,
          tokenType: string,
          expiresIn: { type: "integer" },
          user: ref("User"),
        }),
        {
          security: [],
          requestBody: body(
            object({
              username: string,
              password: { type: "string", writeOnly: true },
            }),
          ),
        },
      ),
    },
    "/auth/me": {
      get: operation(
        "Autenticação",
        "Consultar usuário autenticado",
        ref("User"),
      ),
    },
    "/auth/logout": {
      post: operation(
        "Autenticação",
        "Revogar o token atual",
        {},
        { responses: { 204: { description: "Sessão encerrada" }, ...errors } },
      ),
    },
    "/auth/change-password": {
      post: operation(
        "Autenticação",
        "Trocar senha e revogar todos os tokens do usuário",
        {},
        {
          requestBody: body(
            object({
              currentPassword: { type: "string", writeOnly: true },
              newPassword: {
                type: "string",
                minLength: 12,
                maxLength: 128,
                writeOnly: true,
              },
            }),
          ),
          responses: {
            204: { description: "Senha alterada; entre novamente" },
            ...errors,
          },
        },
      ),
    },
    "/auth/users": {
      get: operation(
        "Usuários",
        "Listar usuários (administrador)",
        object({ users: { type: "array", items: ref("User") } }),
      ),
      post: operation(
        "Usuários",
        "Criar usuário ou conta de integração (administrador)",
        ref("User"),
        {
          requestBody: body(userInput),
          responses: {
            201: response(ref("User"), "Usuário criado"),
            ...errors,
          },
        },
      ),
    },
    "/sessions": {
      get: operation(
        "Sessões",
        "Listar sessões e estado das conexões",
        object({ sessions: { type: "array", items: ref("Session") } }),
      ),
      post: operation(
        "Sessões",
        "Cadastrar e iniciar uma sessão",
        ref("Session"),
        {
          requestBody: body(
            object(
              {
                id: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,64}$" },
                name: { type: "string", minLength: 1, maxLength: 100 },
                pairingPhoneNumber,
              },
              ["id", "name"],
            ),
          ),
          responses: {
            201: response(ref("Session"), "Sessão criada"),
            ...errors,
          },
        },
      ),
    },
    "/sessions/{id}": {
      get: operation("Sessões", "Consultar sessão", ref("Session"), {
        parameters: [id],
      }),
      delete: operation(
        "Sessões",
        "Remover perfil e cancelar agendamentos pendentes",
        {},
        {
          parameters: [id],
          responses: { 204: { description: "Sessão removida" }, ...errors },
        },
      ),
    },
    "/sessions/{id}/qr": {
      get: operation(
        "Sessões",
        "Obter QR Code em data URL PNG",
        object({
          sessionId: string,
          status: string,
          qr: { type: "string", nullable: true },
        }),
        { parameters: [id] },
      ),
    },
    "/sessions/{id}/connect": {
      post: operation("Sessões", "Conectar ou reconectar", ref("Session"), {
        parameters: [id],
        description:
          "Sem corpo, usa QR ou restaura o perfil existente. Informe pairingPhoneNumber para vincular por código. Desconecte antes de trocar o método ou o número de uma sessão já iniciada.",
        requestBody: {
          required: false,
          content: json(object({ pairingPhoneNumber }, [])),
        },
      }),
    },
    "/sessions/{id}/pairing-code": {
      get: operation(
        "Sessões",
        "Consultar código de vinculação",
        object({
          sessionId: string,
          status: string,
          phoneNumber: { type: "string", nullable: true },
          code: { type: "string", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
        }),
        {
          parameters: [id],
          description:
            "Consulte a cada 3 segundos enquanto status=pairing. O código de 8 caracteres é temporário, mantido apenas em memória e renovado automaticamente. code e expiresAt são null quando ainda não existe código vigente ou após autenticar. expiresAt limita sua exibição no WappHub a três minutos; o WhatsApp valida o código no celular.",
        },
      ),
    },
    "/sessions/{id}/disconnect": {
      post: operation(
        "Sessões",
        "Parar conexão preservando o perfil autenticado",
        ref("Session"),
        { parameters: [id] },
      ),
    },
    "/sessions/{id}/directory": {
      get: operation(
        "Sessões",
        "Consultar contatos salvos e grupos, com avisos de falhas parciais",
        ref("Directory"),
        { parameters: [id] },
      ),
    },
    "/sessions/{id}/contacts": {
      get: operation(
        "Sessões",
        "Contatos salvos sem duplicatas; pesquisa sem acentos",
        page("Contact"),
        { parameters: [id, query("search"), ...paging] },
      ),
    },
    "/sessions/{id}/groups": {
      get: operation("Sessões", "Grupos com busca por nome", page("Group"), {
        parameters: [id, query("search"), ...paging],
      }),
    },
    "/directory": {
      get: operation(
        "Sessões",
        "Consultar agenda de todas as sessões com falhas parciais",
        object({ sessions: { type: "array", items: ref("Directory") } }),
      ),
    },
    "/messages": {
      get: operation(
        "Mensagens",
        "Histórico de envios imediatos",
        page("Message"),
        { parameters: [query("sessionId"), query("status"), ...paging] },
      ),
      post: operation(
        "Mensagens",
        "Enviar uma mensagem e acompanhar a confirmação pelo WhatsApp",
        ref("Message"),
        {
          operationId: "sendMessage",
          description:
            "Selecione type: text, image, audio, voice, video, document, sticker, location, contacts ou poll. type ausente mantém o texto legado. Use Idempotency-Key; não repita unknown com outra chave. Destinos: telefone com DDI ou ID @c.us, @lid, @g.us ou @newsletter. Canais exigem permissão de publicação e recusam document, location, contacts, audio, respostas, menções e viewOnce.",
          parameters: [idempotencyHeader],
          requestBody: body(ref("SendMessage")),
          responses: sendingResponses,
        },
      ),
    },
    ...typedSendPaths,
    "/sessions/{id}/channels": {
      get: operation(
        "Sessões",
        "Listar canais conhecidos pela sessão; a listagem não implica permissão de publicação",
        page("Group"),
        { parameters: [id, query("search"), ...paging] },
      ),
    },
    "/messages/{id}/refresh-status": {
      post: operation(
        "Mensagens",
        "Consultar confirmação atual no WhatsApp sem reenviar",
        ref("Message"),
        {
          parameters: [id],
          description:
            "Requer sessão ready e ID WhatsApp conhecido. Preserva o status se a mensagem não estiver disponível. O acompanhamento automático usa apenas eventos de ACK; a consulta periódica e a recuperação ao reconectar estão desativadas. Esta rota faz uma consulta manual explícita.",
        },
      ),
    },
    "/schedules/{id}/refresh-status": {
      post: operation(
        "Agendamentos",
        "Consultar confirmação de um envio agendado sem reenviar",
        ref("Schedule"),
        { parameters: [id] },
      ),
    },
    "/polls": {
      get: operation(
        "Mensagens",
        "Listar enquetes enviadas e agendadas",
        page("PollOverview"),
        {
          description:
            "Por padrão lista enquetes ativas. state=expired ou all permite consultar as demais sem excluir o histórico. Prazo padrão: 24h; poll.durationHours aceita de 1 a 720h. A contagem começa em startedAt (ID retornado); registros incertos sem ID usam createdAt. Agendamentos pendentes não iniciam a contagem. expiresAt e expired indicam o prazo no WappHub; não encerram votação no WhatsApp. kind informa a origem para consultar as respostas.",
          parameters: [
            query("sessionId"),
            {
              name: "state",
              in: "query",
              schema: {
                type: "string",
                enum: ["active", "expired", "all"],
                default: "active",
              },
            },
            ...paging,
          ],
        },
      ),
    },
    "/messages/{id}/poll-results": {
      get: operation(
        "Mensagens",
        "Consultar respostas de uma enquete enviada",
        ref("PollResults"),
        {
          parameters: [id],
          description:
            "Use o UUID do registro WappHub e um messageId WhatsApp confirmado. Durante o prazo, coleta respostas do WhatsApp e persiste versões por participante. Após expirar, retorna somente dados salvos, sem consultar o WhatsApp; sem coleta confirmada retorna HTTP 409 POLL_RESULTS_UNAVAILABLE. O job também exclui expiradas por query. A contagem considera a última seleção coletada até expiresAt, incluindo retiradas. totalVoters conta participantes com seleção ativa e totalSelections soma escolhas. source=stored e warning identificam dados salvos quando a atualização falha ou a sessão está offline. Sem coleta anterior, indisponibilidade gera erro, não zero votos. O prazo vale no WappHub e não bloqueia novos votos no chat.",
        },
      ),
    },
    "/schedules/{id}/poll-results": {
      get: operation(
        "Agendamentos",
        "Consultar respostas de uma enquete enviada",
        ref("PollResults"),
        {
          parameters: [id],
          description:
            "Use o UUID do registro WappHub e um messageId WhatsApp confirmado. Durante o prazo, coleta respostas do WhatsApp e persiste versões por participante. Após expirar, retorna somente dados salvos, sem consultar o WhatsApp; sem coleta confirmada retorna HTTP 409 POLL_RESULTS_UNAVAILABLE. O job também exclui expiradas por query. A contagem considera a última seleção coletada até expiresAt, incluindo retiradas. totalVoters conta participantes com seleção ativa e totalSelections soma escolhas. source=stored e warning identificam dados salvos quando a atualização falha ou a sessão está offline. Sem coleta anterior, indisponibilidade gera erro, não zero votos. O prazo vale no WappHub e não bloqueia novos votos no chat.",
        },
      ),
    },
    "/messages/{id}": {
      get: operation(
        "Mensagens",
        "Consultar resultado de envio",
        ref("Message"),
        { parameters: [id] },
      ),
    },
    "/schedules": {
      get: operation("Agendamentos", "Listar agendamentos", page("Schedule"), {
        parameters: [
          query("sessionId"),
          query("status"),
          query("order"),
          ...paging,
        ],
      }),
      post: operation(
        "Agendamentos",
        "Agendar qualquer tipo de mensagem em data futura com fuso horário",
        ref("Schedule"),
        {
          description:
            "Mesmo formato do envio imediato mais sendAt (ISO 8601 com Z ou offset, no futuro). O arquivo é preservado no PostgreSQL até envio, falha, incerteza ou cancelamento. Sessões offline aguardam conexão. Esta rota NÃO aceita idempotência: repetir cria outro agendamento. Persista o ID no aplicativo chamador.",
          requestBody: body(ref("ScheduleInput")),
          responses: { 201: response(ref("Schedule"), "Agendado"), ...errors },
        },
      ),
    },
    "/schedules/{id}": {
      get: operation("Agendamentos", "Consultar agendamento", ref("Schedule"), {
        parameters: [id],
      }),
    },
    "/schedules/{id}/cancel": {
      post: operation(
        "Agendamentos",
        "Cancelar agendamento pendente",
        ref("Schedule"),
        { parameters: [id] },
      ),
    },
  },
};
