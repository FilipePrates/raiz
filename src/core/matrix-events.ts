import type { MatrixEvent, Room } from "matrix-js-sdk";
import type { Message } from "./types";

export function normalizeHomeserver(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "Informe a URL completa do servidor, como https://matrix.exemplo.br.",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && local))
  ) {
    throw new Error(
      "Use HTTPS para o servidor. HTTP é permitido apenas no localhost.",
    );
  }
  return url.href.replace(/\/$/, "");
}

export function messageFromEvent(
  event: MatrixEvent,
  room: Room,
): Message | undefined {
  const type = event.getType();
  if (
    event.isRedacted() ||
    !["m.room.message", "m.room.encrypted"].includes(type)
  )
    return;
  const content = event.getContent();
  if (content["m.relates_to"]?.rel_type === "m.replace") return; // Edits are applied by the SDK to the original event.
  const kind =
    type === "m.room.encrypted"
      ? "encrypted"
      : content.msgtype === "m.image"
        ? "image"
        : content.msgtype === "m.video"
          ? "video"
          : content.msgtype === "m.file" || content.msgtype === "m.audio"
            ? "file"
            : "text";
  const senderId = event.getSender() ?? "";
  let body = typeof content.body === "string" ? content.body : "";
  const replyTo = content["m.relates_to"]?.["m.in_reply_to"]?.event_id;
  // The Matrix plain-text reply fallback is a quote followed by a blank line.
  if (replyTo && body.startsWith("> "))
    body = body.replace(/^(?:>[^\n]*(?:\n|$))+\n/, "");
  return {
    id: event.getId() ?? event.getTxnId() ?? `${senderId}:${event.getTs()}`,
    roomId: room.roomId,
    senderId,
    senderName: room.getMember(senderId)?.name ?? senderId,
    body: kind === "encrypted" ? "Mensagem criptografada" : body,
    timestamp: event.getTs(),
    kind,
    replyTo: typeof replyTo === "string" ? replyTo : undefined,
    delivery:
      event.status === "not_sent"
        ? "failed"
        : event.status
          ? "sending"
          : "sent",
    media:
      typeof content.url === "string" && content.url.startsWith("mxc://")
        ? {
            uri: content.url,
            mimeType: content.info?.mimetype,
            size: content.info?.size,
            width: content.info?.w,
            height: content.info?.h,
            duration: content.info?.duration,
          }
        : undefined,
  };
}
