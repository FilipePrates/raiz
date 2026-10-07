import { MAX_MESSAGE_LENGTH } from "./types";

export const PUBLIC_ROOM_ID = "!praca:raiz";
export const MAX_LOG_EVENTS = 10_000;

export interface PeerIdentity {
  id: string;
  name: string;
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface EventPayload {
  version: 1;
  nonce: string;
  type: "room" | "text";
  roomId: string;
  author: string;
  name: string;
  timestamp: number;
  body: string;
  topic: string;
  replyTo: string;
}

export interface SignedEvent {
  id: string;
  payload: EventPayload;
  publicKey: JsonWebKey;
  signature: string;
}

const encoder = new TextEncoder();
const algorithm = { name: "ECDSA", namedCurve: "P-256" };

export function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}
export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function publicKeyOnly(key: JsonWebKey): JsonWebKey {
  if (
    key.kty !== "EC" ||
    key.crv !== "P-256" ||
    typeof key.x !== "string" ||
    typeof key.y !== "string" ||
    key.x.length !== 43 ||
    key.y.length !== 43
  )
    throw new Error("Chave pública inválida.");
  return { kty: "EC", crv: "P-256", x: key.x, y: key.y, ext: true };
}

export async function peerId(key: JsonWebKey): Promise<string> {
  return `@${await sha256(JSON.stringify(publicKeyOnly(key)))}:p2p`;
}

export async function createIdentity(name = "Você"): Promise<PeerIdentity> {
  const keys = await crypto.subtle.generateKey(algorithm, true, [
    "sign",
    "verify",
  ]);
  const publicKey = publicKeyOnly(
    await crypto.subtle.exportKey("jwk", keys.publicKey),
  );
  return {
    id: await peerId(publicKey),
    name,
    publicKey,
    privateKey: await crypto.subtle.exportKey("jwk", keys.privateKey),
  };
}

export function canonicalPayload(payload: EventPayload): string {
  // Explicit field order makes hashing and signing independent of JSON key order.
  return JSON.stringify({
    version: payload.version,
    nonce: payload.nonce,
    type: payload.type,
    roomId: payload.roomId,
    author: payload.author,
    name: payload.name,
    timestamp: payload.timestamp,
    body: payload.body,
    topic: payload.topic,
    replyTo: payload.replyTo,
  });
}

export async function signEvent(
  identity: PeerIdentity,
  input: Pick<EventPayload, "type" | "roomId" | "body"> &
    Partial<Pick<EventPayload, "topic" | "replyTo">>,
): Promise<SignedEvent> {
  const payload: EventPayload = {
    version: 1,
    nonce:
      input.type === "room" ? input.roomId.slice(34, -5) : crypto.randomUUID(),
    author: identity.id,
    name: identity.name,
    timestamp: Date.now(),
    type: input.type,
    roomId: input.roomId,
    body: input.body,
    topic: input.topic ?? "",
    replyTo: input.replyTo ?? "",
  };
  const serialized = canonicalPayload(payload);
  const key = await crypto.subtle.importKey(
    "jwk",
    identity.privateKey,
    algorithm,
    false,
    ["sign"],
  );
  const signature = toBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        encoder.encode(serialized),
      ),
    ),
  );
  return {
    id: `$${await sha256(serialized)}`,
    payload,
    publicKey: identity.publicKey,
    signature,
  };
}

export async function verifyEvent(value: unknown): Promise<SignedEvent> {
  if (!value || typeof value !== "object") throw new Error("Evento inválido.");
  const event = value as SignedEvent;
  const p = event.payload;
  if (
    !p ||
    p.version !== 1 ||
    !["text", "room"].includes(p.type) ||
    typeof p.nonce !== "string" ||
    p.nonce.length > 80 ||
    typeof p.roomId !== "string" ||
    !/^![a-zA-Z0-9-]+:raiz$/.test(p.roomId) ||
    p.roomId.length > 80 ||
    typeof p.author !== "string" ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 60 ||
    !Number.isSafeInteger(p.timestamp) ||
    p.timestamp < 0 ||
    p.timestamp > Date.now() + 600_000 ||
    typeof p.body !== "string" ||
    !p.body.trim() ||
    p.body.length > (p.type === "text" ? MAX_MESSAGE_LENGTH : 80) ||
    typeof p.topic !== "string" ||
    p.topic.length > 500 ||
    typeof p.replyTo !== "string" ||
    p.replyTo.length > 80 ||
    typeof event.id !== "string" ||
    !/^\$[0-9a-f]{64}$/.test(event.id) ||
    typeof event.signature !== "string" ||
    event.signature.length > 100 ||
    !event.publicKey
  )
    throw new Error("Formato de evento inválido.");
  if (
    p.type === "room" &&
    (p.roomId === PUBLIC_ROOM_ID ||
      p.roomId !== `!${p.author.slice(1, 33)}-${p.nonce}:raiz` ||
      !/^[a-f0-9-]{36}$/.test(p.nonce) ||
      p.replyTo)
  )
    throw new Error("Definição de comunidade inválida.");
  const publicKey = publicKeyOnly(event.publicKey);
  const serialized = canonicalPayload(p);
  if (
    p.author !== (await peerId(publicKey)) ||
    event.id !== `$${await sha256(serialized)}`
  )
    throw new Error("Identidade ou hash inválido.");
  const key = await crypto.subtle.importKey(
    "jwk",
    publicKey,
    algorithm,
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      fromBase64(event.signature),
      encoder.encode(serialized),
    ))
  )
    throw new Error("Assinatura inválida.");
  // Strip extra fields and all possible private key material from received events.
  return {
    id: event.id,
    payload: JSON.parse(serialized) as EventPayload,
    publicKey,
    signature: event.signature,
  };
}
