import {
  type CommunicationTransport,
  type NetworkSnapshot,
  type NewCommunity,
  validateCommunity,
  validateText,
} from "./types";
import {
  MAX_LOG_EVENTS,
  PUBLIC_ROOM_ID,
  createIdentity,
  fromBase64,
  peerId,
  publicKeyOnly,
  signEvent,
  toBase64,
  verifyEvent,
  type PeerIdentity,
  type SignedEvent,
} from "./p2p-events";
import { PeerStore } from "./p2p-store";

interface PairSignal {
  version: 1;
  requestId: string;
  type: "offer" | "answer";
  sdp: string;
  author: string;
  name: string;
  timestamp: number;
  publicKey: JsonWebKey;
  signature: string;
}

interface Link {
  id: string;
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  remote?: { id: string; name: string };
  connection: "direct" | "relay" | "unknown";
  incoming: Promise<void>;
  outgoing: Promise<void>;
  queued: number;
  pending: number;
  expiry?: ReturnType<typeof setTimeout>;
}

type Frame =
  | { type: "inventory" | "want"; ids: string[] }
  | { type: "event"; event: SignedEvent };
const MAX_FRAME_BYTES = 24_000;
const encoder = new TextEncoder();
const signalPayload = (signal: PairSignal) =>
  JSON.stringify({
    version: signal.version,
    requestId: signal.requestId,
    type: signal.type,
    sdp: signal.sdp,
    author: signal.author,
    name: signal.name,
    timestamp: signal.timestamp,
    publicKey: publicKeyOnly(signal.publicKey),
  });

async function acquireIdentityLock(): Promise<() => void> {
  if (!navigator.locks)
    throw new Error(
      "Use um navegador atualizado com suporte a Web Locks para proteger sua identidade local.",
    );
  let release = () => {};
  const acquired = await new Promise<boolean>((resolve, reject) => {
    void navigator.locks
      .request("raiz.p2p.identity", { ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        const held = new Promise<void>((done) => {
          release = done;
        });
        resolve(true);
        await held;
      })
      .catch(reject);
  });
  if (!acquired)
    throw new Error(
      "A Raiz P2P já está aberta neste perfil de navegador. Use outra janela com um perfil diferente para testar dois participantes.",
    );
  return release;
}

export class P2PTransport implements CommunicationTransport {
  private state: NetworkSnapshot;
  private listeners = new Set<() => void>();
  private events = new Map<string, SignedEvent>();
  private links = new Map<string, Link>();
  private iceServers: RTCIceServer[] = [];
  private closed = false;
  private mutation: Promise<void> = Promise.resolve();

  private constructor(
    private store: PeerStore,
    private identity: PeerIdentity,
    private releaseLock: () => void,
  ) {
    this.state = {
      mode: "p2p",
      status: "local",
      user: { id: identity.id, name: identity.name },
      server: "Seu dispositivo · WebRTC",
      rooms: [],
      messages: {},
      peers: [],
    };
  }

  static async open(): Promise<P2PTransport> {
    if (!window.isSecureContext || !crypto.subtle || !window.RTCPeerConnection)
      throw new Error(
        "P2P precisa de HTTPS ou localhost e um navegador com WebRTC.",
      );
    const release = await acquireIdentityLock();
    let store: PeerStore | undefined;
    try {
      store = await PeerStore.open();
      const identity = (await store.loadIdentity()) ?? (await createIdentity());
      if (identity.id !== (await peerId(identity.publicKey)))
        throw new Error("A identidade local não passou na verificação.");
      await store.saveIdentity(identity);
      const transport = new P2PTransport(store, identity, release);
      const saved = await store.loadEvents();
      if (saved.length > MAX_LOG_EVENTS)
        throw new Error("O histórico excedeu o limite deste protótipo.");
      for (const value of saved) {
        const event = await verifyEvent(value);
        transport.events.set(event.id, event);
      }
      transport.refresh();
      return transport;
    } catch (error) {
      store?.close();
      release();
      throw error;
    }
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private refresh(error?: string) {
    if (this.closed) return;
    const sorted = Array.from(this.events.values()).sort(
      (a, b) =>
        a.payload.timestamp - b.payload.timestamp || a.id.localeCompare(b.id),
    );
    const rooms = [
      {
        id: PUBLIC_ROOM_ID,
        name: "Praça aberta",
        topic:
          "Uma praça entre dispositivos. Conecte uma pessoa para compartilhar esta conversa.",
        members: 1,
        access: "public" as const,
        encrypted: false,
        canPost: true,
      },
    ];
    const known = new Set([PUBLIC_ROOM_ID]);
    for (const event of sorted) {
      if (event.payload.type !== "room" || known.has(event.payload.roomId))
        continue;
      known.add(event.payload.roomId);
      rooms.push({
        id: event.payload.roomId,
        name: event.payload.body,
        topic: event.payload.topic,
        members: 1,
        access: "public",
        encrypted: false,
        canPost: true,
      });
    }
    const messages = Object.fromEntries(
      rooms.map((room) => {
        const text = sorted.filter(
          (event) =>
            event.payload.type === "text" && event.payload.roomId === room.id,
        );
        room.members = new Set([
          this.identity.id,
          ...text.map((event) => event.payload.author),
        ]).size;
        return [
          room.id,
          text.map((event) => ({
            id: event.id,
            roomId: room.id,
            senderId: event.payload.author,
            senderName: event.payload.name,
            timestamp: event.payload.timestamp,
            body: event.payload.body,
            kind: "text" as const,
            delivery: "stored" as const,
            replyTo: event.payload.replyTo || undefined,
          })),
        ];
      }),
    );
    const peers = Array.from(this.links.values()).map((link) => ({
      id: link.id,
      name: link.remote?.name ?? "Novo participante",
      status:
        link.channel?.readyState === "open"
          ? "connected"
          : link.pc.connectionState,
      connection: link.connection,
    }));
    this.state = {
      ...this.state,
      user: { id: this.identity.id, name: this.identity.name },
      rooms,
      messages,
      peers,
      status: peers.some((peer) => peer.status === "connected")
        ? "online"
        : "local",
      error,
    };
    this.listeners.forEach((listener) => listener());
  }

  private serialized<T>(action: () => Promise<T>): Promise<T> {
    const next = this.mutation.then(action);
    this.mutation = next.then(
      () => {},
      () => {},
    );
    return next;
  }

  private async append(event: SignedEvent, source?: string): Promise<boolean> {
    return this.serialized(async () => {
      if (this.closed) throw new Error("A sessão P2P foi encerrada.");
      if (this.events.has(event.id)) return false;
      if (this.events.size >= MAX_LOG_EVENTS)
        throw new Error(
          "O protótipo atingiu o limite de 10.000 eventos. Exporte um backup antes de ampliar o armazenamento.",
        );
      if (event.payload.type === "room") {
        if (this.state.rooms.length >= 100)
          throw new Error("O protótipo atingiu o limite de 100 comunidades.");
        const previous = Array.from(this.events.values()).find(
          (item) =>
            item.payload.type === "room" &&
            item.payload.roomId === event.payload.roomId,
        );
        if (previous) throw new Error("A comunidade já possui uma definição.");
      }
      if (
        event.payload.type === "text" &&
        Array.from(this.events.values()).filter(
          (item) =>
            item.payload.type === "text" &&
            item.payload.roomId === event.payload.roomId,
        ).length >= 2000
      )
        throw new Error(
          "O protótipo atingiu o limite de 2.000 mensagens por comunidade.",
        );
      await this.store.saveEvent(event);
      this.events.set(event.id, event);
      this.refresh();
      for (const link of this.links.values()) {
        if (link.id !== source && link.channel?.readyState === "open")
          this.queueFrame(link, { type: "event", event });
      }
      return true;
    });
  }

  async sendText(roomId: string, body: string, replyTo?: string) {
    const text = validateText(body);
    if (!this.state.rooms.some((room) => room.id === roomId))
      throw new Error("Comunidade não encontrada.");
    if (
      replyTo &&
      !this.state.messages[roomId]?.some((message) => message.id === replyTo)
    )
      throw new Error("A mensagem original não foi encontrada.");
    await this.append(
      await signEvent(this.identity, {
        type: "text",
        roomId,
        body: text,
        replyTo,
      }),
    );
  }

  async createRoom(input: NewCommunity): Promise<string> {
    const room = validateCommunity(input);
    const id = `!${this.identity.id.slice(1, 33)}-${crypto.randomUUID()}:raiz`;
    await this.append(
      await signEvent(this.identity, {
        type: "room",
        roomId: id,
        body: room.name,
        topic: room.topic,
      }),
    );
    return id;
  }

  async joinRoom(): Promise<string> {
    throw new Error(
      "Na Raiz P2P, conecte um participante para sincronizar as comunidades públicas.",
    );
  }
  async loadEarlier() {
    return false;
  }

  async setDisplayName(value: string) {
    const name = value.trim();
    if (!name || name.length > 60)
      throw new Error("Use um nome de 1 a 60 caracteres.");
    const identity = { ...this.identity, name };
    await this.store.saveIdentity(identity);
    this.identity = identity;
    this.refresh();
  }

  configureIceServers(value: string) {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed) || parsed.length > 5)
      throw new Error("Informe uma lista JSON com até 5 servidores STUN/TURN.");
    for (const entry of parsed) {
      const urls = typeof entry?.urls === "string" ? [entry.urls] : entry?.urls;
      if (
        !Array.isArray(urls) ||
        !urls.length ||
        urls.length > 5 ||
        urls.some(
          (url) =>
            typeof url !== "string" ||
            url.length > 500 ||
            !/^(stun|stuns|turn|turns):[^\s]+$/.test(url),
        )
      )
        throw new Error("Cada servidor precisa de urls STUN/TURN válidas.");
      if (
        (entry.username !== undefined && typeof entry.username !== "string") ||
        (entry.credential !== undefined && typeof entry.credential !== "string")
      )
        throw new Error("Credenciais STUN/TURN inválidas.");
    }
    this.iceServers = parsed.map((entry) => ({
      urls: entry.urls,
      username: entry.username,
      credential: entry.credential,
    }));
  }

  private newLink(id: string): Link {
    if (this.closed) throw new Error("A sessão P2P foi encerrada.");
    if (this.links.size >= 8)
      throw new Error("Este protótipo permite até 8 conexões simultâneas.");
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const link: Link = {
      id,
      pc,
      connection: "unknown",
      incoming: Promise.resolve(),
      outgoing: Promise.resolve(),
      queued: 0,
      pending: 0,
    };
    this.links.set(id, link);
    link.expiry = setTimeout(() => {
      if (link.channel?.readyState !== "open") this.removePeer(id);
    }, 180_000);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed")
        this.removePeer(id);
      else this.refresh();
    };
    pc.ondatachannel = (event) => {
      if (event.channel.label !== "raiz.events.v1" || link.channel) {
        event.channel.close();
        return;
      }
      this.attachChannel(link, event.channel);
    };
    this.refresh();
    return link;
  }

  private attachChannel(link: Link, channel: RTCDataChannel) {
    link.channel = channel;
    channel.bufferedAmountLowThreshold = 64_000;
    channel.onopen = () => {
      if (!link.remote) {
        this.removePeer(link.id);
        return;
      }
      clearTimeout(link.expiry);
      this.refresh();
      void this.inspectConnection(link).catch(() => {});
      const ids = Array.from(this.events.keys());
      for (let offset = 0; offset < ids.length; offset += 100)
        this.queueFrame(link, {
          type: "inventory",
          ids: ids.slice(offset, offset + 100),
        });
    };
    channel.onclose = () => this.removePeer(link.id);
    channel.onerror = () => this.removePeer(link.id);
    channel.onmessage = (message) => {
      if (
        typeof message.data !== "string" ||
        encoder.encode(message.data).byteLength > MAX_FRAME_BYTES ||
        link.pending >= 256
      ) {
        this.removePeer(link.id);
        return;
      }
      link.pending++;
      link.incoming = link.incoming
        .then(() => this.receive(link, message.data))
        .catch(() => {
          this.removePeer(link.id);
          this.refresh(
            "Um participante enviou dados inválidos ou excedeu os limites. A conexão foi encerrada.",
          );
        })
        .finally(() => {
          link.pending--;
        });
    };
  }

  private queueFrame(link: Link, frame: Frame) {
    if (link.queued >= 256) {
      this.removePeer(link.id);
      this.refresh(
        "Uma conexão excedeu o limite de sincronização. Reconecte para continuar.",
      );
      return Promise.resolve();
    }
    const text = JSON.stringify(frame);
    if (encoder.encode(text).byteLength > MAX_FRAME_BYTES) {
      this.removePeer(link.id);
      return Promise.resolve();
    }
    link.queued++;
    link.outgoing = link.outgoing
      .then(async () => {
        const channel = link.channel;
        if (!channel || channel.readyState !== "open") return;
        if (channel.bufferedAmount > 128_000) {
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              clearTimeout(timer);
              channel.removeEventListener("bufferedamountlow", low);
              channel.removeEventListener("close", close);
            };
            const low = () => {
              cleanup();
              resolve();
            };
            const close = () => {
              cleanup();
              reject(new Error("Conexão encerrada."));
            };
            const timer = setTimeout(() => {
              cleanup();
              reject(new Error("Canal congestionado."));
            }, 10_000);
            channel.addEventListener("bufferedamountlow", low, { once: true });
            channel.addEventListener("close", close, { once: true });
          });
        }
        if (channel.readyState === "open") channel.send(text);
      })
      .catch(() => {
        this.removePeer(link.id);
        this.refresh(
          "A conexão foi interrompida. O histórico permanece salvo; reconecte para sincronizar.",
        );
      })
      .finally(() => {
        link.queued--;
      });
    return link.outgoing;
  }

  private async receive(link: Link, text: string) {
    if (!this.links.has(link.id)) return;
    const frame: unknown = JSON.parse(text);
    if (!frame || typeof frame !== "object" || !("type" in frame))
      throw new Error("Frame inválido.");
    if (frame.type === "event" && "event" in frame) {
      const event = await verifyEvent(frame.event);
      await this.append(event, link.id);
      return;
    }
    if (
      (frame.type !== "inventory" && frame.type !== "want") ||
      !("ids" in frame) ||
      !Array.isArray(frame.ids) ||
      frame.ids.length > 100 ||
      frame.ids.some(
        (id) => typeof id !== "string" || !/^\$[a-f0-9]{64}$/.test(id),
      )
    )
      throw new Error("Inventário inválido.");
    if (frame.type === "inventory") {
      const missing = frame.ids.filter((id) => !this.events.has(id));
      if (missing.length) this.queueFrame(link, { type: "want", ids: missing });
    } else {
      for (const id of frame.ids) {
        const event = this.events.get(id);
        if (event) await this.queueFrame(link, { type: "event", event });
      }
    }
  }

  private async inspectConnection(link: Link) {
    const stats = await link.pc.getStats();
    stats.forEach((report) => {
      if (report.type !== "transport" || !report.selectedCandidatePairId)
        return;
      const pair = stats.get(report.selectedCandidatePairId);
      const local = stats.get(pair?.localCandidateId);
      const remote = stats.get(pair?.remoteCandidateId);
      link.connection =
        local?.candidateType === "relay" || remote?.candidateType === "relay"
          ? "relay"
          : "direct";
    });
    this.refresh();
  }

  private async gather(link: Link): Promise<void> {
    if (link.pc.iceGatheringState === "complete") return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        link.pc.removeEventListener("icegatheringstatechange", changed);
      };
      const changed = () => {
        if (link.pc.iceGatheringState === "complete") {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "A coleta de endereços demorou demais. Confira os servidores STUN/TURN e tente novamente.",
          ),
        );
      }, 20_000);
      link.pc.addEventListener("icegatheringstatechange", changed);
    });
  }

  private async encodeSignal(link: Link): Promise<string> {
    await this.gather(link);
    const description = link.pc.localDescription;
    if (!description || !["offer", "answer"].includes(description.type))
      throw new Error("Convite não disponível.");
    const signal: PairSignal = {
      version: 1,
      requestId: link.id,
      type: description.type as "offer" | "answer",
      sdp: description.sdp,
      author: this.identity.id,
      name: this.identity.name,
      timestamp: Date.now(),
      publicKey: this.identity.publicKey,
      signature: "",
    };
    const key = await crypto.subtle.importKey(
      "jwk",
      this.identity.privateKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    signal.signature = toBase64(
      new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          key,
          encoder.encode(signalPayload(signal)),
        ),
      ),
    );
    return `raiz1.${toBase64(encoder.encode(JSON.stringify(signal)))}`;
  }

  private async decodeSignal(
    value: string,
    type: PairSignal["type"],
  ): Promise<PairSignal> {
    const code = value.trim();
    if (!code.startsWith("raiz1.") || code.length > 100_000)
      throw new Error("Código Raiz inválido. Copie o código completo.");
    const signal = JSON.parse(
      new TextDecoder().decode(fromBase64(code.slice(6))),
    ) as PairSignal;
    if (
      !signal ||
      signal.version !== 1 ||
      signal.type !== type ||
      typeof signal.sdp !== "string" ||
      signal.sdp.length > 60_000 ||
      typeof signal.requestId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(signal.requestId) ||
      typeof signal.name !== "string" ||
      !signal.name.trim() ||
      signal.name.length > 60 ||
      typeof signal.signature !== "string" ||
      signal.signature.length > 100 ||
      !Number.isSafeInteger(signal.timestamp) ||
      signal.timestamp < Date.now() - 900_000 ||
      signal.timestamp > Date.now() + 60_000
    )
      throw new Error("Código incorreto ou expirado. Gere um novo convite.");
    if (
      signal.author !== (await peerId(signal.publicKey)) ||
      signal.author === this.identity.id
    )
      throw new Error("A identidade do convite é inválida ou pertence a você.");
    const key = await crypto.subtle.importKey(
      "jwk",
      publicKeyOnly(signal.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        fromBase64(signal.signature),
        encoder.encode(signalPayload(signal)),
      ))
    )
      throw new Error("A assinatura do convite é inválida.");
    return signal;
  }

  async createOffer(): Promise<{ id: string; code: string }> {
    const link = this.newLink(crypto.randomUUID());
    try {
      this.attachChannel(
        link,
        link.pc.createDataChannel("raiz.events.v1", { ordered: true }),
      );
      await link.pc.setLocalDescription(await link.pc.createOffer());
      return { id: link.id, code: await this.encodeSignal(link) };
    } catch (error) {
      this.removePeer(link.id);
      throw error;
    }
  }

  async acceptOffer(value: string): Promise<{ id: string; code: string }> {
    const offer = await this.decodeSignal(value, "offer");
    if (this.links.has(offer.requestId))
      throw new Error("Este convite já foi aceito.");
    const link = this.newLink(offer.requestId);
    link.remote = { id: offer.author, name: offer.name };
    try {
      await link.pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      this.refresh();
      return { id: link.id, code: await this.encodeSignal(link) };
    } catch (error) {
      this.removePeer(link.id);
      throw error;
    }
  }

  async completeOffer(id: string, value: string) {
    const answer = await this.decodeSignal(value, "answer");
    const link = this.links.get(id);
    if (
      !link ||
      answer.requestId !== id ||
      link.pc.signalingState !== "have-local-offer"
    )
      throw new Error("A resposta não corresponde a este convite.");
    link.remote = { id: answer.author, name: answer.name };
    await link.pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    this.refresh();
  }

  removePeer(id: string) {
    const link = this.links.get(id);
    if (!link) return;
    this.links.delete(id);
    clearTimeout(link.expiry);
    link.channel?.close();
    link.pc.close();
    this.refresh();
  }

  async exportBackup(): Promise<void> {
    const data = JSON.stringify(
      {
        format: "raiz-backup-v1",
        identity: this.identity,
        events: Array.from(this.events.values()),
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `raiz-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async disconnect() {
    if (this.closed) return;
    this.closed = true;
    for (const id of Array.from(this.links.keys())) this.removePeer(id);
    await this.mutation;
    this.listeners.clear();
    this.store.close();
    this.releaseLock();
  }
}
