import type { MessageContent, MessageType, SendOptions } from "@wapp/contracts";
export const messageTypeLabels: Record<MessageType, string> = {
  text: "Texto",
  image: "Imagem",
  audio: "Áudio",
  voice: "Mensagem de voz",
  video: "Vídeo / GIF",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contacts: "Cartões de contato",
  poll: "Enquete",
};
export const hasMedia = (type: MessageType) =>
  ["image", "audio", "voice", "video", "document", "sticker"].includes(type);
export const hasCaption = (type: MessageType) =>
  ["image", "video", "document"].includes(type);
export function MessageFields({ type }: { type: MessageType }) {
  if (hasMedia(type))
    return (
      <>
        <label>
          Arquivo (até 16 MiB)
          <input
            type="file"
            name="file"
            required
            accept={
              type === "document"
                ? undefined
                : type === "sticker"
                  ? "image/webp,image/png,image/jpeg,video/mp4"
                  : type === "voice" || type === "audio"
                    ? "audio/*"
                    : `${type}/*`
            }
          />
        </label>
        {type === "video" ? (
          <>
            <small>
              Vídeos exigem Google Chrome com codecs compatíveis. Para GIF,
              selecione um vídeo curto.
            </small>
            <label>
              Formato
              <select name="asGif">
                <option value="false">Vídeo</option>
                <option value="true">Reproduzir como GIF</option>
              </select>
            </label>
          </>
        ) : null}
        {type === "voice" ? (
          <small>Prefira OGG/Opus para mensagens de voz.</small>
        ) : null}
        {type === "sticker" ? (
          <>
            <label>
              Nome do pacote
              <input name="stickerName" maxLength={100} />
            </label>
            <label>
              Autor
              <input name="stickerAuthor" maxLength={100} />
            </label>
          </>
        ) : null}
      </>
    );
  if (type === "location")
    return (
      <>
        <label>
          Latitude
          <input
            name="latitude"
            type="number"
            step="any"
            min={-90}
            max={90}
            required
          />
        </label>
        <label>
          Longitude
          <input
            name="longitude"
            type="number"
            step="any"
            min={-180}
            max={180}
            required
          />
        </label>
        <label>
          Nome do local
          <input name="locationName" maxLength={100} />
        </label>
        <label>
          Endereço
          <input name="address" maxLength={500} />
        </label>
      </>
    );
  if (type === "contacts")
    return (
      <label>
        IDs dos contatos, um por linha
        <textarea
          name="contacts"
          rows={4}
          required
          placeholder="5511999999999@c.us"
        />
        <small>
          Use os IDs retornados pela agenda da sessão. Até 20 contatos.
        </small>
      </label>
    );
  if (type === "poll")
    return (
      <>
        <label>
          Pergunta
          <input name="pollName" maxLength={255} required />
        </label>
        <label>
          Duração da enquete (horas)
          <input
            name="pollDurationHours"
            type="number"
            min={1}
            max={720}
            step={1}
            defaultValue={24}
            required
          />
          <small>
            Após esse prazo, sai da lista de enquetes ativas. O prazo começa
            quando o envio retorna um ID. A votação pode continuar no WhatsApp.
          </small>
        </label>
        <label>
          Opções, uma por linha
          <textarea
            name="pollOptions"
            rows={5}
            required
            placeholder={"Manhã\nTarde"}
          />
          <small>De 2 a 12 opções diferentes.</small>
        </label>
        <label>
          Respostas
          <select name="multipleAnswers">
            <option value="false">Uma opção</option>
            <option value="true">Várias opções</option>
          </select>
        </label>
      </>
    );
  return null;
}
const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
const lines = (text: string) =>
  text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
export async function readMessageContent(
  type: MessageType,
  form: FormData,
  text: string,
): Promise<MessageContent> {
  if (type === "text") return { type, text };
  if (type === "location")
    return {
      type,
      location: {
        latitude: Number(value(form, "latitude")),
        longitude: Number(value(form, "longitude")),
        ...(value(form, "locationName")
          ? { name: value(form, "locationName") }
          : {}),
        ...(value(form, "address") ? { address: value(form, "address") } : {}),
      },
    };
  if (type === "contacts")
    return { type, contacts: lines(value(form, "contacts")) };
  if (type === "poll")
    return {
      type,
      poll: {
        name: value(form, "pollName"),
        durationHours: Number(value(form, "pollDurationHours") || 24),
        options: value(form, "pollOptions")
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        allowMultipleAnswers: value(form, "multipleAnswers") === "true",
      },
    };
  const file = form.get("file");
  if (!(file instanceof File) || !file.size)
    throw new Error("Selecione um arquivo não vazio.");
  if (file.size > 16 * 1024 * 1024)
    throw new Error("O arquivo deve ter até 16 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  const media = {
    mimetype: file.type || "application/octet-stream",
    data: btoa(chunks.join("")),
    filename: file.name,
  };
  if (type === "sticker")
    return {
      type,
      media,
      name: value(form, "stickerName"),
      author: value(form, "stickerAuthor"),
    };
  if (type === "video")
    return {
      type,
      media,
      caption: text,
      asGif: value(form, "asGif") === "true",
    };
  if (type === "image" || type === "document")
    return { type, media, caption: text };
  return { type, media };
}
export function readSendOptions(form: FormData): SendOptions | undefined {
  const replyTo = value(form, "replyTo");
  const mentions = lines(value(form, "mentions"));
  const groupMentions = value(form, "groupMentions")
    .split("\n")
    .filter((item) => item.trim())
    .map((item) => {
      const separator = item.indexOf("|");
      if (separator < 1)
        throw new Error("Informe cada menção de grupo como ID|Nome.");
      return {
        id: item.slice(0, separator).trim(),
        subject: item.slice(separator + 1).trim(),
      };
    });
  return replyTo || mentions.length || groupMentions.length
    ? {
        ...(replyTo ? { replyTo } : {}),
        ...(mentions.length ? { mentions } : {}),
        ...(groupMentions.length ? { groupMentions } : {}),
      }
    : undefined;
}
