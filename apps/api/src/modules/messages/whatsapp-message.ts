import whatsapp from "whatsapp-web.js";
import { AppError } from "../../shared/errors.js";
import type { NormalizedMessageInput } from "../../shared/validation.js";
import type { ClientPort } from "../sessions/session-service.js";
const { MessageMedia, Location, Poll } = whatsapp;

export async function prepareMessage(
  client: ClientPort,
  input: NormalizedMessageInput,
  chatId: string,
) {
  const options: whatsapp.MessageSendOptions = {
    sendSeen: false,
    parseVCards: false,
    waitUntilMsgSent: true,
    ignoreQuoteErrors: false,
    quotedMessageId: input.options?.replyTo,
    mentions: input.options?.mentions,
    groupMentions: input.options?.groupMentions,
  };
  if (input.options?.replyTo) {
    const quoted = await client.getMessageById(input.options.replyTo);
    if (!quoted || quoted.id.remote !== chatId)
      throw new AppError(
        422,
        "INVALID_REPLY",
        "A mensagem citada precisa existir nesta sessão e pertencer à conversa de destino.",
      );
  }
  let content: Parameters<whatsapp.Client["sendMessage"]>[1];
  switch (input.type) {
    case "text":
      content = input.text;
      break;
    case "location":
      content = new Location(
        input.location.latitude,
        input.location.longitude,
        input.location,
      );
      break;
    case "poll":
      content = new Poll(input.poll.name, input.poll.options, {
        allowMultipleAnswers: input.poll.allowMultipleAnswers,
        messageSecret: undefined,
      });
      break;
    case "contacts": {
      content = await Promise.all(
        input.contacts.map((id) => client.getContactById(id)),
      );
      if (
        content.some(
          (contact) => !contact || !contact.isUser || contact.isGroup,
        )
      )
        throw new AppError(
          422,
          "INVALID_CONTACT",
          "Um dos contatos não está disponível nesta sessão.",
        );
      break;
    }
    default: {
      content = new MessageMedia(
        input.media.mimetype,
        input.media.data,
        input.media.filename,
        Buffer.byteLength(input.media.data, "base64"),
      );
      if ("caption" in input) options.caption = input.caption;
      if (input.type === "voice") options.sendAudioAsVoice = true;
      if (input.type === "document") options.sendMediaAsDocument = true;
      if (input.type === "image") {
        options.isViewOnce = input.viewOnce;
        options.sendMediaAsHd = input.hd;
      }
      if (input.type === "video") {
        options.isViewOnce = input.viewOnce;
        options.sendVideoAsGif = input.asGif;
      }
      if (input.type === "sticker") {
        options.sendMediaAsSticker = true;
        options.stickerName = input.name;
        options.stickerAuthor = input.author;
        options.stickerCategories = input.categories;
      }
    }
  }
  return { content, options };
}
