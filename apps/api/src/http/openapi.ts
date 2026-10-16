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
    "Mensagem enviada; não confirma entrega/leitura",
  ),
  200: response(
    ref("Message"),
    "Registro de uma operação idempotente anterior, que pode estar sent, failed ou unknown",
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
    name: "Wapp",
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
    title: "Wapp API",
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
          enum: ["sending", "sent", "failed", "unknown"],
        },
        messageId: { type: "string", nullable: true },
        error: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        sentAt: { type: "string", format: "date-time", nullable: true },
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
            "sent",
            "failed",
            "unknown",
            "cancelled",
          ],
        },
        messageId: { type: "string", nullable: true },
        error: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        sentAt: { type: "string", nullable: true, format: "date-time" },
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
            object({
              id: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,64}$" },
              name: { type: "string", minLength: 1, maxLength: 100 },
            }),
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
      }),
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
        "Enviar uma mensagem de qualquer tipo suportado",
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
