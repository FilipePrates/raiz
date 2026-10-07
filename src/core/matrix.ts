import {
  ClientEvent,
  EventType,
  KnownMembership,
  MsgType,
  Preset,
  RoomEvent,
  Visibility,
  createClient,
  type MatrixClient,
} from "matrix-js-sdk";
import {
  type CommunicationTransport,
  type NetworkSnapshot,
  type NewCommunity,
  validateCommunity,
  validateText,
} from "./types";
import { messageFromEvent, normalizeHomeserver } from "./matrix-events";

export interface MatrixCredentials {
  homeserver: string;
  username: string;
  password: string;
}

export class MatrixTransport implements CommunicationTransport {
  private state: NetworkSnapshot;
  private listeners = new Set<() => void>();
  private closed = false;

  private constructor(
    private client: MatrixClient,
    server: string,
    userId: string,
  ) {
    this.state = {
      mode: "matrix",
      status: "connecting",
      user: { id: userId, name: userId.split(":")[0].slice(1) },
      server,
      rooms: [],
      messages: {},
    };
    client.on(ClientEvent.Sync, (state, _previous, data) => {
      const error = data?.error;
      this.update({
        status:
          state === "PREPARED" || state === "SYNCING"
            ? "online"
            : state === "ERROR"
              ? "reconnecting"
              : "connecting",
        error: error
          ? "Sincronização interrompida. O servidor será contatado novamente."
          : undefined,
      });
      if (state === "PREPARED" || state === "SYNCING") this.refresh();
    });
    client.on(RoomEvent.Timeline, () => this.refresh());
    client.on(RoomEvent.Name, () => this.refresh());
    client.on(RoomEvent.MyMembership, () => this.refresh());
    client.on(RoomEvent.LocalEchoUpdated, () => this.refresh());
    client.on(ClientEvent.Room, () => this.refresh());
  }

  static async connect(
    credentials: MatrixCredentials,
  ): Promise<MatrixTransport> {
    const server = normalizeHomeserver(credentials.homeserver);
    const loginClient = createClient({ baseUrl: server });
    const flows = await loginClient.loginFlows();
    if (!flows.flows.some((flow) => flow.type === "m.login.password"))
      throw new Error(
        "Este servidor exige outro método de login. O protótipo suporta login por senha.",
      );
    const response = await loginClient.login("m.login.password", {
      identifier: { type: "m.id.user", user: credentials.username.trim() },
      password: credentials.password,
      initial_device_display_name: "Raiz web — public communities",
    });
    const client = createClient({
      baseUrl: server,
      accessToken: response.access_token,
      userId: response.user_id,
      deviceId: response.device_id,
      timelineSupport: true,
    });
    const transport = new MatrixTransport(client, server, response.user_id);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(
            new Error(
              "O servidor não concluiu a sincronização em 30 segundos.",
            ),
          );
        }, 30_000);
        const onSync = (state: string) => {
          if (state === "PREPARED") {
            cleanup();
            resolve();
          }
          if (state === "ERROR") {
            cleanup();
            reject(
              new Error(
                "Não foi possível sincronizar com o servidor. Confira a conexão e as permissões.",
              ),
            );
          }
        };
        const cleanup = () => {
          clearTimeout(timer);
          client.removeListener(ClientEvent.Sync, onSync);
        };
        client.on(ClientEvent.Sync, onSync);
        void client
          .startClient({ initialSyncLimit: 40, lazyLoadMembers: true })
          .catch((error) => {
            cleanup();
            reject(error);
          });
      });
      transport.refresh();
      return transport;
    } catch (error) {
      await transport.disconnect();
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

  private update(changes: Partial<NetworkSnapshot>) {
    if (this.closed) return;
    this.state = { ...this.state, ...changes };
    this.listeners.forEach((listener) => listener());
  }

  private refresh() {
    const joined = this.client
      .getRooms()
      .filter(
        (room) =>
          room.getMyMembership() === KnownMembership.Join &&
          !room.isSpaceRoom(),
      );
    const rooms = joined
      .map((room) => {
        const joinRule = room.currentState
          .getStateEvents(EventType.RoomJoinRules, "")
          ?.getContent().join_rule;
        return {
          id: room.roomId,
          name: room.name,
          topic:
            room.currentState
              .getStateEvents(EventType.RoomTopic, "")
              ?.getContent().topic ?? "",
          alias: room.getCanonicalAlias() ?? undefined,
          members: room.getJoinedMemberCount(),
          encrypted: this.client.isRoomEncrypted(room.roomId),
          access:
            joinRule === "public"
              ? ("public" as const)
              : joinRule === "restricted" || joinRule === "knock_restricted"
                ? ("restricted" as const)
                : ("invite" as const),
          canPost: room.currentState.maySendEvent(
            EventType.RoomMessage,
            this.state.user.id,
          ),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const messages = Object.fromEntries(
      joined.map((room) => [
        room.roomId,
        room
          .getLiveTimeline()
          .getEvents()
          .map((event) => messageFromEvent(event, room))
          .filter((message) => message !== undefined),
      ]),
    );
    this.update({ rooms, messages });
  }

  async sendText(roomId: string, body: string, replyTo?: string) {
    const text = validateText(body);
    if (this.closed) throw new Error("A sessão foi encerrada.");
    const room = this.client.getRoom(roomId);
    if (!room || room.getMyMembership() !== KnownMembership.Join)
      throw new Error("Entre na comunidade antes de enviar.");
    // Fail closed. Private encrypted communication needs full key management in a later milestone.
    if (this.client.isRoomEncrypted(roomId))
      throw new Error(
        "Salas criptografadas ainda não são suportadas. Nenhuma mensagem foi enviada.",
      );
    if (
      !room.currentState.maySendEvent(EventType.RoomMessage, this.state.user.id)
    )
      throw new Error("Você não tem permissão para publicar nesta comunidade.");
    if (replyTo && !room.findEventById(replyTo))
      throw new Error("A mensagem original não foi encontrada.");
    await this.client.sendMessage(roomId, {
      msgtype: MsgType.Text,
      body: text,
      ...(replyTo
        ? { "m.relates_to": { "m.in_reply_to": { event_id: replyTo } } }
        : {}),
    });
    this.refresh();
  }

  async createRoom(input: NewCommunity) {
    const room = validateCommunity(input);
    const result = await this.client.createRoom({
      name: room.name,
      topic: room.topic,
      visibility: Visibility.Public,
      preset: Preset.PublicChat,
    });
    this.refresh();
    return result.room_id;
  }

  async joinRoom(value: string) {
    const alias = value.trim();
    if (!/^[#!][^\s:]+:[^\s]+$/.test(alias))
      throw new Error(
        "Use um endereço Matrix, como #comunidade:servidor.br, ou o ID da sala.",
      );
    const room = await this.client.joinRoom(alias);
    this.refresh();
    return room.roomId;
  }

  async loadEarlier(roomId: string) {
    const room = this.client.getRoom(roomId);
    if (!room) return false;
    const before = room.getLiveTimeline().getEvents().length;
    await this.client.scrollback(room, 40);
    this.refresh();
    return room.getLiveTimeline().getEvents().length > before;
  }

  async disconnect() {
    if (this.closed) return;
    this.closed = true;
    this.client.stopClient();
    this.client.removeAllListeners();
    this.listeners.clear();
    // Revoke the short-lived in-memory login on the server too.
    try {
      await this.client.logout(true);
    } catch {
      throw new Error(
        "A sessão local foi encerrada, mas o servidor não confirmou a revogação. Revogue este dispositivo em outro cliente.",
      );
    }
  }
}
