export type MessageKind = "text" | "image" | "video" | "file" | "encrypted";

// Media uses Matrix mxc:// references, never an arbitrary remote URL.
export interface MediaReference {
  uri: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
  timestamp: number;
  kind: MessageKind;
  replyTo?: string;
  media?: MediaReference;
  delivery: "sent" | "stored" | "sending" | "failed";
}

export interface Community {
  id: string;
  name: string;
  topic: string;
  alias?: string;
  members: number;
  access: "public" | "invite" | "restricted";
  encrypted: boolean;
  canPost: boolean;
}

export interface NetworkSnapshot {
  mode: "demo" | "matrix" | "p2p";
  status: "local" | "connecting" | "online" | "reconnecting" | "offline";
  user: { id: string; name: string };
  server: string;
  rooms: Community[];
  messages: Record<string, Message[]>;
  peers?: {
    id: string;
    name: string;
    status: string;
    connection: "direct" | "relay" | "unknown";
  }[];
  error?: string;
}

export interface NewCommunity {
  name: string;
  topic: string;
}

export interface CommunicationTransport {
  getSnapshot(): NetworkSnapshot;
  subscribe(listener: () => void): () => void;
  sendText(roomId: string, body: string, replyTo?: string): Promise<void>;
  createRoom(room: NewCommunity): Promise<string>;
  joinRoom(aliasOrId: string): Promise<string>;
  loadEarlier(roomId: string): Promise<boolean>;
  disconnect(): Promise<void>;
}

export const MAX_MESSAGE_LENGTH = 4000;

export function validateText(body: string): string {
  const text = body.trim();
  if (!text) throw new Error("Escreva uma mensagem antes de enviar.");
  if (text.length > MAX_MESSAGE_LENGTH)
    throw new Error("A mensagem deve ter até 4.000 caracteres.");
  return text;
}

export function validateCommunity(input: NewCommunity): NewCommunity {
  const name = input.name.trim();
  const topic = input.topic.trim();
  if (!name || name.length > 80)
    throw new Error("Use um nome de 1 a 80 caracteres.");
  if (topic.length > 500)
    throw new Error("A descrição deve ter até 500 caracteres.");
  return { name, topic };
}
