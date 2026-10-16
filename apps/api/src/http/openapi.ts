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
const messageInput = object({
  sessionId: string,
  to: string,
  text: { type: "string", minLength: 1, maxLength: 4096 },
});
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
    version: "1.0.0",
    description:
      "API de um workspace compartilhado para usuários e aplicativos autenticados. Texto, sessões WhatsApp e agendamento. O uso de whatsapp-web.js não oferece garantia contra bloqueio.",
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
      Message: object({
        id: { type: "string", format: "uuid" },
        sessionId: string,
        to: string,
        text: string,
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
        ...messageInput.properties,
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
        "Enviar texto para contato ou grupo",
        ref("Message"),
        {
          description:
            "Use Idempotency-Key para repetir a mesma requisição sem reenviar. A chave é vinculada ao usuário. Em resultado unknown, confira o WhatsApp antes de criar outro envio.",
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              schema: { type: "string", maxLength: 128 },
            },
          ],
          requestBody: body(messageInput),
          responses: {
            201: response(ref("Message"), "Enviado"),
            200: response(ref("Message"), "Repetição idempotente"),
            202: response(ref("Message"), "Envio original ainda em andamento"),
            ...errors,
          },
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
        "Agendar texto em data futura com fuso horário",
        ref("Schedule"),
        {
          requestBody: body(
            object({
              ...messageInput.properties,
              sendAt: { type: "string", format: "date-time" },
            }),
          ),
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
