import {
  type CommunicationTransport,
  type NetworkSnapshot,
  type NewCommunity,
  type Message,
  validateCommunity,
  validateText,
} from "./types";

export const DEMO_STORAGE_KEY = "raiz.demo.v1";

export function seedDemo(): NetworkSnapshot {
  const now = Date.now();
  const rooms = [
    {
      id: "!praca:demo",
      name: "Praça aberta",
      topic:
        "O ponto de encontro da nossa rede. Chegue, compartilhe uma ideia e faça parte.",
      members: 4,
    },
    {
      id: "!tecnologia:demo",
      name: "Tecnologia livre",
      topic:
        "Código aberto, infraestrutura própria e conhecimento compartilhado.",
      members: 3,
    },
    {
      id: "!cultura:demo",
      name: "Cultura & território",
      topic: "Histórias, iniciativas e encontros de todos os cantos do Brasil.",
      members: 3,
    },
    {
      id: "!construcao:demo",
      name: "Construindo a Raiz",
      topic:
        "Um espaço para pensar e construir juntos os próximos passos da rede.",
      members: 3,
    },
  ].map((room) => ({
    ...room,
    access: "public" as const,
    encrypted: false,
    canPost: true,
  }));
  const authors = [
    { id: "@ana:demo", name: "Ana Martins" },
    { id: "@joao:demo", name: "João Oliveira" },
    { id: "@luiza:demo", name: "Luiza Santos" },
  ];
  const bodies = [
    [
      "Toda rede começa com uma conversa. 🌱\n\nEste é o nosso primeiro espaço de encontro: para trocar ideias, encontrar pessoas e construir algo que seja nosso.",
      "Gosto da ideia de uma praça digital. Cada comunidade pode ter seu próprio servidor, e ainda assim conversar com as outras.",
      "Por aqui, a conversa segue a ordem do tempo. Sem disputar a sua atenção. O que vocês gostariam de construir primeiro?",
    ],
    [
      "Que tal começarmos com servidores pequenos, operados por comunidades e universidades? Independência também é poder escolher onde nossos dados ficam.",
      "O protocolo é aberto. Podemos construir clientes diferentes sem precisar reinventar a comunicação.",
    ],
    [
      "Da cidade ao interior, toda história tem espaço aqui. Qual iniciativa da sua região merece ser conhecida?",
      "Estou organizando um encontro de cultura e tecnologia na biblioteca do bairro. Quem mais tem projetos assim?",
    ],
    [
      "Primeiro passo: comunidades e conversas de texto. Depois, imagens, vídeo e mensagens privadas com criptografia ponta a ponta.",
      "P2P é um caminho de pesquisa. Hoje, a base é a federação Matrix, com servidores que podem ser administrados por nós.",
    ],
  ];
  const messages = Object.fromEntries(
    rooms.map((room, index) => [
      room.id,
      bodies[index].map(
        (body, i): Message => ({
          id: `$demo-${index}-${i}`,
          roomId: room.id,
          senderId: authors[i % 3].id,
          senderName: authors[i % 3].name,
          body,
          timestamp: now - (bodies[index].length - i) * 1000 * 60 * 18,
          kind: "text",
          delivery: "sent",
        }),
      ),
    ]),
  );
  return {
    mode: "demo",
    status: "local",
    user: { id: "@voce:demo", name: "Você" },
    server: "Neste navegador",
    rooms,
    messages,
  };
}

function isDemoState(value: unknown): value is NetworkSnapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as NetworkSnapshot;
  if (
    data.mode !== "demo" ||
    !Array.isArray(data.rooms) ||
    !data.messages ||
    typeof data.messages !== "object"
  )
    return false;
  if (!data.user || data.user.id !== "@voce:demo" || data.user.name !== "Você")
    return false;
  if (data.rooms.length > 100) return false;
  const ids = new Set<string>();
  return data.rooms.every((room) => {
    if (
      !room ||
      typeof room.id !== "string" ||
      !room.id.endsWith(":demo") ||
      ids.has(room.id)
    )
      return false;
    ids.add(room.id);
    if (
      typeof room.name !== "string" ||
      typeof room.topic !== "string" ||
      !Number.isFinite(room.members)
    )
      return false;
    const messages = data.messages[room.id];
    return (
      Array.isArray(messages) &&
      messages.length <= 2000 &&
      messages.every(
        (message) =>
          message &&
          typeof message.id === "string" &&
          message.roomId === room.id &&
          typeof message.body === "string" &&
          typeof message.senderId === "string" &&
          typeof message.senderName === "string" &&
          Number.isFinite(message.timestamp) &&
          message.kind === "text" &&
          message.delivery === "sent" &&
          (message.replyTo === undefined ||
            typeof message.replyTo === "string"),
      )
    );
  });
}

export class DemoTransport implements CommunicationTransport {
  private state: NetworkSnapshot;
  private listeners = new Set<() => void>();

  constructor(private storage?: Pick<Storage, "getItem" | "setItem">) {
    this.state = seedDemo();
    try {
      const saved = storage?.getItem(DEMO_STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      if (isDemoState(parsed))
        this.state = {
          ...parsed,
          status: "local",
          error: undefined,
          rooms: parsed.rooms.map((room) => ({
            ...room,
            access: "public",
            encrypted: false,
            canPost: true,
          })),
        };
    } catch {
      /* A damaged/unavailable demo cache should not prevent startup. */
    }
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private commit(next: NetworkSnapshot) {
    // Keep the current draft intact if browser storage is full or unavailable.
    this.storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  async sendText(roomId: string, body: string, replyTo?: string) {
    const text = validateText(body);
    if (!this.state.rooms.some((room) => room.id === roomId))
      throw new Error("Comunidade não encontrada.");
    const messages = this.state.messages[roomId] ?? [];
    if (messages.length >= 2000)
      throw new Error(
        "A demonstração atingiu o limite de mensagens nesta comunidade.",
      );
    if (replyTo && !messages.some((message) => message.id === replyTo))
      throw new Error("A mensagem original não foi encontrada.");
    const message: Message = {
      id: `$${crypto.randomUUID()}`,
      roomId,
      senderId: this.state.user.id,
      senderName: this.state.user.name,
      body: text,
      timestamp: Date.now(),
      kind: "text",
      delivery: "sent",
      ...(replyTo ? { replyTo } : {}),
    };
    this.commit({
      ...this.state,
      messages: { ...this.state.messages, [roomId]: [...messages, message] },
    });
  }

  async createRoom(input: NewCommunity) {
    const room = validateCommunity(input);
    if (this.state.rooms.length >= 100)
      throw new Error("A demonstração atingiu o limite de comunidades.");
    const id = `!${crypto.randomUUID()}:demo`;
    this.commit({
      ...this.state,
      rooms: [
        ...this.state.rooms,
        {
          ...room,
          id,
          members: 1,
          access: "public",
          encrypted: false,
          canPost: true,
        },
      ],
      messages: { ...this.state.messages, [id]: [] },
    });
    return id;
  }

  async joinRoom(): Promise<string> {
    throw new Error(
      "Conecte um servidor Matrix para entrar em comunidades da rede.",
    );
  }
  async loadEarlier() {
    return false;
  }
  async disconnect() {
    this.listeners.clear();
  }
}
