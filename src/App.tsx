import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Globe2,
  Hash,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  Network,
  Plus,
  Reply,
  Search,
  Send,
  Server,
  Smile,
  Sprout,
  Users,
  X,
} from "lucide-react";
import { DemoTransport } from "./core/demo";
import {
  MAX_MESSAGE_LENGTH,
  type CommunicationTransport,
  type Message,
  type NetworkSnapshot,
} from "./core/types";
import { P2PTransport } from "./core/p2p";
import PeerPanel from "./PeerPanel";

type ModalName = "connect" | "create" | "join" | "network" | "peers" | null;

function newDemo(): DemoTransport {
  try {
    return new DemoTransport(window.localStorage);
  } catch {
    return new DemoTransport();
  }
}

function initials(name: string) {
  return name
    .split(/[\s_]+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
function avatarColor(name: string) {
  return ["sage", "clay", "blue", "gold"][
    Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4
  ];
}
function displayError(error: unknown) {
  if (error && typeof error === "object" && "errcode" in error) {
    const code = String(error.errcode);
    if (code === "M_FORBIDDEN")
      return "Acesso negado. Confira suas credenciais e permissões.";
    if (code === "M_LIMIT_EXCEEDED")
      return "O servidor recebeu muitas solicitações. Aguarde um pouco e tente novamente.";
    if (code === "M_UNKNOWN_TOKEN")
      return "A sessão expirou. Conecte-se novamente.";
  }
  if (error instanceof Error) {
    if (error.name === "QuotaExceededError")
      return "O armazenamento do navegador está cheio. Sua mensagem continua no rascunho.";
    if (error.message === "Failed to fetch")
      return "Não foi possível acessar o servidor. Verifique a URL, a conexão e a configuração de CORS.";
    return error.message;
  }
  return "Não foi possível concluir a ação. Tente novamente.";
}

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="Fechar" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function ConnectForm({
  connect,
}: {
  connect: (credentials: {
    homeserver: string;
    username: string;
    password: string;
  }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await connect({
        homeserver: String(form.get("server")),
        username: String(form.get("username")),
        password: String(form.get("password")),
      });
    } catch (error) {
      setError(displayError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <p className="muted">
        Entre com uma conta existente no servidor de sua escolha. Suas
        credenciais são enviadas diretamente para ele.
      </p>
      <label>
        Servidor Matrix
        <input
          name="server"
          type="url"
          required
          defaultValue="http://localhost:8008"
          placeholder="https://matrix.exemplo.br"
          disabled={busy}
          autoComplete="url"
        />
      </label>
      <label>
        Usuário
        <input
          name="username"
          required
          placeholder="@voce:servidor.br ou nome de usuário"
          autoComplete="username"
          disabled={busy}
        />
      </label>
      <label>
        Senha
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={busy}
        />
      </label>
      <div className="inline-note">
        <LockKeyhole size={17} />
        <span>
          Esta versão suporta comunidades de texto. Salas com criptografia ponta
          a ponta ainda não são suportadas.
        </span>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <Network size={18} />
        )}
        {busy ? "Conectando…" : "Conectar ao servidor"}
      </button>
      <p className="small muted">
        O acesso fica apenas na memória: ao atualizar a página, será preciso
        entrar novamente. Use o botão de sair para revogar a sessão no servidor.
        Contas são criadas pelo administrador neste primeiro protótipo.
      </p>
    </form>
  );
}

function CommunityForm({
  mode,
  transport,
  done,
}: {
  mode: "create" | "join";
  transport: CommunicationTransport;
  done: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const id =
        mode === "create"
          ? await transport.createRoom({
              name: String(form.get("name")),
              topic: String(form.get("topic")),
            })
          : await transport.joinRoom(String(form.get("alias")));
      done(id);
    } catch (error) {
      setError(displayError(error));
    } finally {
      setBusy(false);
    }
  }
  const demo = transport.getSnapshot().mode === "demo";
  const p2p = transport.getSnapshot().mode === "p2p";
  return (
    <form className="form-stack" onSubmit={submit}>
      <p className="muted">
        {mode === "create"
          ? demo
            ? "Crie um espaço na demonstração local. Ele ficará salvo neste navegador."
            : p2p
              ? "Crie um espaço público entre dispositivos. A comunidade e seu histórico serão compartilhados com todos os pares conectados."
              : "Crie uma comunidade pública no seu servidor. Outras pessoas poderão entrar e ler as conversas."
          : "Entre pelo endereço de uma comunidade Matrix, inclusive de outro servidor quando a federação estiver habilitada."}
      </p>
      {mode === "create" ? (
        <>
          <label>
            Nome da comunidade
            <input
              name="name"
              required
              maxLength={80}
              placeholder="Uma ideia que conecta"
              disabled={busy}
            />
          </label>
          <label>
            Sobre este espaço
            <textarea
              name="topic"
              rows={3}
              maxLength={500}
              placeholder="O que vocês vão conversar por aqui?"
              disabled={busy}
            />
          </label>
          <div className="inline-note">
            <Globe2 size={17} />
            <span>Comunidade pública, sem criptografia ponta a ponta.</span>
          </div>
        </>
      ) : (
        <label>
          Endereço da comunidade
          <input
            name="alias"
            required
            placeholder="#comunidade:servidor.br ou !id:servidor.br"
            disabled={busy}
          />
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <Plus size={18} />
        )}
        {busy
          ? "Aguarde…"
          : mode === "create"
            ? "Criar comunidade"
            : "Entrar na comunidade"}
      </button>
    </form>
  );
}

function NetworkDetails({ state }: { state: NetworkSnapshot }) {
  if (state.mode === "p2p")
    return (
      <div className="network-details">
        <div className="network-diagram">
          <span>
            <Users size={24} />
            Seu dispositivo
          </span>
          <i />
          <span>
            <Network size={24} />
            Conexão direta
          </span>
          <i />
          <span>
            <Users size={24} />
            Outro dispositivo
          </span>
        </div>
        <p>
          Cada dispositivo guarda uma identidade e uma cópia das conversas
          públicas. Pares conectados trocam mensagens assinadas e sincronizam o
          histórico que falta. Um participante pode encaminhar os eventos para
          outros pares.
        </p>
        <div className="detail-line">
          <span>Transporte</span>
          <strong>WebRTC DataChannel</strong>
        </div>
        <div className="detail-line">
          <span>Armazenamento</span>
          <strong>Neste dispositivo (IndexedDB)</strong>
        </div>
        <p className="inline-note">
          Este protótipo não depende de um servidor de contas ou mensagens.
          Pareamento é manual. Algumas redes precisam de STUN ou TURN; todos os
          pares conectados recebem todas as comunidades públicas.
        </p>
        <h3>Próximas perguntas a resolver</h3>
        <ul className="roadmap-list">
          <li>
            <span>01</span>Entrega para dispositivos offline e recuperação da
            identidade
          </li>
          <li>
            <span>02</span>Grupos privados, bloqueio, moderação e descoberta
          </li>
          <li>
            <span>03</span>Mídia, clientes móveis e testes de escala
          </li>
        </ul>
        <p className="small muted">
          Matrix permanece um caminho opcional de integração. Esta rede P2P usa
          um protocolo experimental próprio e não é compatível com MSG Gov.
        </p>
      </div>
    );
  return (
    <div className="network-details">
      <div className="network-diagram">
        <span>
          <Users size={24} />
          Você
        </span>
        <i />
        <span>
          <Server size={24} />
          Seu servidor
        </span>
        <i />
        <span>
          <Network size={24} />
          Outros servidores
        </span>
      </div>
      <p>
        Na rede Matrix, cada pessoa se conecta a um servidor. Servidores
        independentes podem compartilhar conversas pela federação. Você escolhe
        quem opera a sua infraestrutura.
      </p>
      <div className="detail-line">
        <span>Sua conexão</span>
        <strong>
          {state.mode === "demo" ? "Demonstração local" : "Matrix"}
        </strong>
      </div>
      <div className="detail-line">
        <span>Servidor</span>
        <strong>{state.server}</strong>
      </div>
      <p className="inline-note">
        {state.mode === "demo"
          ? "Os perfis e as conversas de exemplo são fictícios. Nenhuma mensagem é enviada para outras pessoas."
          : "O cliente fala diretamente com o servidor escolhido. A federação e a localização dos dados dependem da configuração e dos participantes de cada sala."}
      </p>
      <h3>O que vem pela frente</h3>
      <ul className="roadmap-list">
        <li>
          <span>01</span>Mensagens privadas com verificação e recuperação de
          chaves
        </li>
        <li>
          <span>02</span>Imagens, arquivos e vídeo
        </li>
        <li>
          <span>03</span>Chamadas, clientes móveis e pesquisa P2P
        </li>
      </ul>
      <p className="small muted">
        Matrix é federado. P2P direto e integração com MSG Gov são
        possibilidades futuras, ainda sem implementação ou garantia de
        compatibilidade.
      </p>
      <a
        href="https://matrix.org/"
        target="_blank"
        rel="noreferrer"
        className="text-link"
      >
        Conheça o protocolo Matrix <ArrowUpRight size={16} />
      </a>
    </div>
  );
}

export default function App() {
  const [transport, setTransport] = useState<CommunicationTransport>(newDemo);
  const [starting, setStarting] = useState(
    !new URLSearchParams(location.search).has("demo"),
  );
  const state = useSyncExternalStore(
    transport.subscribe,
    transport.getSnapshot,
  );
  const [roomId, setRoomId] = useState(state.rooms[0]?.id ?? "");
  const [modal, setModal] = useState<ModalName>(null);
  const [tab, setTab] = useState<"chat" | "about">("chat");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replies, setReplies] = useState<Record<string, Message | undefined>>(
    {},
  );
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [noMore, setNoMore] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const timeline = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const isNearBottom = useRef(true);
  const room = state.rooms.find((room) => room.id === roomId);
  const messages = state.messages[roomId] ?? [];
  const draft = drafts[roomId] ?? "";
  const reply = replies[roomId];
  const filtered = messages.filter((message) =>
    `${message.body} ${message.senderName}`
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  const demo = state.mode === "demo";
  const p2p = state.mode === "p2p";
  const peerCount =
    state.peers?.filter((peer) => peer.status === "connected").length ?? 0;
  const writable = room && !room.encrypted && room.canPost;

  useEffect(() => {
    if (new URLSearchParams(location.search).has("demo")) return;
    let cancelled = false;
    void P2PTransport.open()
      .then((next) => {
        if (cancelled) {
          void next.disconnect();
          return;
        }
        setTransport(next);
        setRoomId(next.getSnapshot().rooms[0]?.id ?? "");
        setStarting(false);
      })
      .catch((error) => {
        if (!cancelled) {
          setError(displayError(error));
          setStarting(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!room && state.rooms.length) setRoomId(state.rooms[0].id);
  }, [room, state.rooms]);
  useEffect(() => {
    if (isNearBottom.current && timeline.current)
      timeline.current.scrollTop = timeline.current.scrollHeight;
  }, [messages.length, roomId, tab]);
  useEffect(
    () => () => {
      void transport.disconnect().catch(() => {});
    },
    [transport],
  );

  function selectRoom(id: string) {
    setRoomId(id);
    setQuery("");
    setTab("chat");
    setError("");
    setSidebarOpen(false);
    setEmojiOpen(false);
    isNearBottom.current = true;
  }

  async function connect(credentials: {
    homeserver: string;
    username: string;
    password: string;
  }) {
    const { MatrixTransport } = await import("./core/matrix");
    const next = await MatrixTransport.connect(credentials);
    setDrafts({});
    setReplies({});
    setNoMore({});
    setQuery("");
    setError("");
    setTransport(next);
    setRoomId(next.getSnapshot().rooms[0]?.id ?? "");
    setModal(null);
  }

  async function disconnect() {
    let warning = "";
    try {
      await transport.disconnect();
    } catch (error) {
      warning = displayError(error);
    }
    const next = new URLSearchParams(location.search).has("demo")
      ? newDemo()
      : await P2PTransport.open();
    setTransport(next);
    setDrafts({});
    setReplies({});
    setQuery("");
    setNoMore({});
    setRoomId(next.getSnapshot().rooms[0]?.id ?? "");
    setError(warning);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!writable || sending || !draft.trim()) return;
    const targetRoom = roomId;
    const sentDraft = draft;
    const sentReply = reply;
    setSending(true);
    setError("");
    try {
      await transport.sendText(targetRoom, sentDraft, sentReply?.id);
      setDrafts((previous) =>
        previous[targetRoom] === sentDraft
          ? { ...previous, [targetRoom]: "" }
          : previous,
      );
      setReplies((previous) =>
        previous[targetRoom] === sentReply
          ? { ...previous, [targetRoom]: undefined }
          : previous,
      );
      isNearBottom.current = true;
      if (timeline.current)
        timeline.current.scrollTop = timeline.current.scrollHeight;
    } catch (error) {
      setError(displayError(error));
    } finally {
      setSending(false);
    }
  }

  async function earlier() {
    const target = roomId;
    const oldHeight = timeline.current?.scrollHeight ?? 0;
    const oldTop = timeline.current?.scrollTop ?? 0;
    setLoadingHistory(true);
    setError("");
    try {
      const more = await transport.loadEarlier(target);
      if (!more) setNoMore((previous) => ({ ...previous, [target]: true }));
      requestAnimationFrame(() => {
        if (timeline.current)
          timeline.current.scrollTop =
            oldTop + timeline.current.scrollHeight - oldHeight;
      });
    } catch (error) {
      setError(displayError(error));
    } finally {
      setLoadingHistory(false);
    }
  }

  const statusLabel = p2p
    ? peerCount
      ? `${peerCount} ${peerCount === 1 ? "par conectado" : "pares conectados"}`
      : "P2P · salvo localmente"
    : demo
      ? "Demonstração local"
      : state.status === "online"
        ? "Conectado ao Matrix"
        : state.status === "reconnecting"
          ? "Reconectando…"
          : "Sincronizando…";

  return (
    <div className="app-shell">
      {starting && (
        <div className="startup-screen" role="status">
          <Sprout size={36} />
          <span>Preparando sua identidade local…</span>
        </div>
      )}
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar navegação"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            selectRoom(state.rooms[0]?.id ?? "");
          }}
          aria-label="Raiz, início"
        >
          <div className="brand-mark">
            <Sprout size={29} strokeWidth={1.8} />
          </div>
          <span>
            raiz<span className="brand-period">.</span>
            <small>uma rede de possibilidades</small>
          </span>
        </a>
        <div className="workspace">
          <div className="workspace-icon">
            <Leaf size={20} />
          </div>
          <div>
            <strong>Raiz Brasil</strong>
            <span>
              {p2p
                ? "Sua rede entre dispositivos"
                : demo
                  ? "Seu espaço de demonstração"
                  : "Seu espaço na rede"}
            </span>
          </div>
          <ChevronDown size={16} aria-hidden="true" />
        </div>
        <div className="nav-caption">SEU PONTO DE ENCONTRO</div>
        <button
          className="nav-item selected"
          onClick={() => selectRoom(state.rooms[0]?.id ?? "")}
        >
          <MessageCircle size={19} />
          Comunidades<span className="count">{state.rooms.length}</span>
        </button>
        <button
          className="nav-item"
          onClick={() => setModal(p2p ? "peers" : demo ? "connect" : "join")}
        >
          <Globe2 size={19} />
          {p2p ? "Conectar pessoas" : "Explorar a rede"}
          <ArrowUpRight size={15} />
        </button>
        <div className="room-section-heading">
          <span>SUAS COMUNIDADES</span>
          <button
            className="icon-button"
            onClick={() => setModal("create")}
            aria-label="Criar comunidade"
          >
            <Plus size={17} />
          </button>
        </div>
        <nav className="room-list" aria-label="Comunidades">
          {state.rooms.map((item) => (
            <button
              key={item.id}
              className={`room-link ${roomId === item.id ? "active" : ""}`}
              onClick={() => selectRoom(item.id)}
            >
              <Hash size={17} />
              <span>{item.name}</span>
              {roomId === item.id && <span className="active-dot" />}
            </button>
          ))}
          {!state.rooms.length && (
            <p className="small muted room-empty">
              Você ainda não entrou em uma comunidade.
            </p>
          )}
        </nav>
        <button className="create-link" onClick={() => setModal("create")}>
          <Plus size={16} />
          Criar comunidade
        </button>
        <div className="sidebar-bottom">
          <div className="grow-note">
            <div className="grow-icon">
              <Sprout size={25} />
            </div>
            <strong>Uma rede feita por nós.</strong>
            <p>
              Pequenos começos.
              <br />
              Conexões que vão longe.
            </p>
            <button onClick={() => setModal("network")}>
              Conheça a Raiz <ArrowRight size={15} />
            </button>
          </div>
          <div className="profile">
            <div className="avatar sage">{initials(state.user.name)}</div>
            <div>
              <strong>{state.user.name}</strong>
              <span>
                <i
                  className={
                    demo || state.status === "local"
                      ? "local-dot"
                      : "online-dot"
                  }
                />
                {p2p
                  ? "Identidade neste dispositivo"
                  : demo
                    ? "Perfil de demonstração"
                    : state.status === "online"
                      ? "Conectado"
                      : "Reconectando"}
              </span>
            </div>
            {state.mode === "matrix" && (
              <button
                className="icon-button"
                aria-label="Desconectar do Matrix"
                onClick={() => {
                  void disconnect().catch((error) =>
                    setError(displayError(error)),
                  );
                }}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir navegação"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span>Comunidades</span>
            <span className="slash">/</span>
            <strong>{room?.name ?? "Sua rede"}</strong>
          </div>
          <div className="topbar-actions">
            <span
              className={`connection-label ${demo || state.status === "local" ? "demo" : ""}`}
            >
              <i />
              {statusLabel}
            </span>
            <button
              className="connect-button"
              onClick={() =>
                setModal(p2p ? "peers" : demo ? "connect" : "network")
              }
            >
              {p2p ? (
                <>
                  <Network size={16} />
                  Conectar pessoa
                </>
              ) : demo ? (
                <>
                  <Network size={16} />
                  Conectar servidor
                </>
              ) : (
                <>
                  <Server size={16} />
                  Meu servidor
                </>
              )}
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-intro">
            <div>
              <span className="eyebrow">CONVERSAS QUE CONECTAM</span>
              <h1>
                {room?.name ?? "Seu lugar na rede"}
                <span className="title-dot">.</span>
              </h1>
              <p>
                {room?.topic ||
                  "Crie uma comunidade ou entre em um espaço existente para começar a conversar."}
              </p>
            </div>
            <div className="intro-symbol">
              <MessageCircle size={30} strokeWidth={1.4} />
              <span className="symbol-spark">✦</span>
            </div>
          </div>
          <div className="content-grid">
            <section
              className="conversation-panel"
              aria-label="Conversa da comunidade"
            >
              <div className="conversation-toolbar">
                <div className="tabs">
                  <button
                    className={tab === "chat" ? "active" : ""}
                    onClick={() => setTab("chat")}
                  >
                    <MessageCircle size={16} />
                    Conversa
                  </button>
                  <button
                    className={tab === "about" ? "active" : ""}
                    onClick={() => setTab("about")}
                  >
                    Sobre
                  </button>
                </div>
                <div className="room-meta">
                  {room && (
                    <>
                      <Users size={15} />
                      <span>
                        {room.members}{" "}
                        {room.members === 1 ? "participante" : "participantes"}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {tab === "about" ? (
                <div className="about-panel">
                  <div className="about-icon">
                    <Hash size={32} />
                  </div>
                  <h2>{room?.name ?? "Sua primeira comunidade"}</h2>
                  <p>{room?.topic}</p>
                  {room && (
                    <>
                      <div className="detail-line">
                        <span>Acesso</span>
                        <strong>
                          {room.access === "public"
                            ? "Público"
                            : room.access === "restricted"
                              ? "Restrito"
                              : "Por convite"}
                        </strong>
                      </div>
                      <div className="detail-line">
                        <span>Criptografia ponta a ponta</span>
                        <strong>
                          {room.encrypted
                            ? "Sala criptografada (não suportada)"
                            : "Não habilitada"}
                        </strong>
                      </div>
                      <div className="detail-line">
                        <span>ID da comunidade</span>
                        <code>{room.id}</code>
                      </div>
                      {room.alias && (
                        <div className="detail-line">
                          <span>Endereço</span>
                          <code>{room.alias}</code>
                        </div>
                      )}
                    </>
                  )}
                  <p className="small muted">
                    {demo
                      ? "Este é um ambiente local de demonstração com perfis fictícios."
                      : "A infraestrutura e a localização dos dados são definidas pelos servidores participantes."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="conversation-search">
                    <Search size={16} />
                    <input
                      type="search"
                      aria-label="Buscar nas mensagens carregadas"
                      placeholder="Buscar nesta conversa"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query && (
                      <span className="small muted">
                        {filtered.length}{" "}
                        {filtered.length === 1 ? "resultado" : "resultados"}
                      </span>
                    )}
                  </div>
                  <div
                    className="timeline"
                    ref={timeline}
                    onScroll={() => {
                      if (timeline.current)
                        isNearBottom.current =
                          timeline.current.scrollHeight -
                            timeline.current.scrollTop -
                            timeline.current.clientHeight <
                          100;
                    }}
                  >
                    {demo && !query && (
                      <div className="welcome-card">
                        <div className="welcome-illustration">
                          <Sprout size={45} strokeWidth={1.4} />
                          <span className="little-orbit orbit-one" />
                          <span className="little-orbit orbit-two" />
                        </div>
                        <div>
                          <span className="welcome-label">
                            BEM-VINDO À RAIZ
                          </span>
                          <h2>
                            O próximo passo começa
                            <br />
                            com a sua voz.
                          </h2>
                          <p>
                            Um espaço aberto para compartilhar,
                            <br className="desktop-break" /> colaborar e criar
                            novas conexões.
                          </p>
                        </div>
                        <span className="card-number">01 / COMEÇAR</span>
                      </div>
                    )}
                    {state.mode === "matrix" && room && !noMore[roomId] && (
                      <button
                        className="history-button"
                        disabled={loadingHistory}
                        onClick={() => {
                          void earlier();
                        }}
                      >
                        {loadingHistory ? (
                          <LoaderCircle className="spin" size={14} />
                        ) : (
                          <ArrowDown size={14} />
                        )}
                        Carregar mensagens anteriores
                      </button>
                    )}
                    {filtered.map((message, index) => {
                      const previous = filtered[index - 1];
                      const newDay =
                        !previous ||
                        new Date(previous.timestamp).toDateString() !==
                          new Date(message.timestamp).toDateString();
                      const original = message.replyTo
                        ? messages.find((item) => item.id === message.replyTo)
                        : undefined;
                      return (
                        <div key={message.id}>
                          {newDay && (
                            <div className="day-divider">
                              <span>
                                {new Intl.DateTimeFormat("pt-BR", {
                                  day: "numeric",
                                  month: "long",
                                  timeZone: "America/Sao_Paulo",
                                }).format(message.timestamp)}
                              </span>
                            </div>
                          )}
                          <article
                            className={`message ${message.senderId === state.user.id ? "own-message" : ""}`}
                          >
                            <div
                              className={`avatar ${avatarColor(message.senderName)}`}
                            >
                              {initials(message.senderName)}
                            </div>
                            <div className="message-content">
                              <div className="message-author">
                                <strong>{message.senderName}</strong>
                                {message.senderId === state.user.id && (
                                  <span className="you-label">você</span>
                                )}
                                <time
                                  dateTime={new Date(
                                    message.timestamp,
                                  ).toISOString()}
                                >
                                  {new Intl.DateTimeFormat("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "America/Sao_Paulo",
                                  }).format(message.timestamp)}
                                </time>
                              </div>
                              {message.replyTo && (
                                <div className="reply-quote">
                                  <Reply size={14} />
                                  <span>
                                    <strong>
                                      {original?.senderName ?? "Resposta"}
                                    </strong>{" "}
                                    {original?.body.slice(0, 110) ??
                                      "Mensagem anterior"}
                                  </span>
                                </div>
                              )}
                              <p
                                className={
                                  message.kind === "encrypted" ? "muted" : ""
                                }
                              >
                                {message.kind === "encrypted"
                                  ? "Mensagem criptografada. Esta versão ainda não pode ler este conteúdo."
                                  : message.body}
                              </p>
                              {message.kind !== "text" &&
                                message.kind !== "encrypted" && (
                                  <span className="media-note">
                                    {message.kind === "image"
                                      ? "Imagem"
                                      : message.kind === "video"
                                        ? "Vídeo"
                                        : "Arquivo"}{" "}
                                    · visualização disponível em uma próxima
                                    versão
                                  </span>
                                )}
                              <div className="message-actions">
                                {message.delivery !== "sent" &&
                                  message.delivery !== "stored" && (
                                    <span
                                      className={
                                        message.delivery === "failed"
                                          ? "form-error small"
                                          : "small muted"
                                      }
                                    >
                                      {message.delivery === "failed"
                                        ? "Falha no envio. Seu rascunho foi mantido."
                                        : "Enviando…"}
                                    </span>
                                  )}
                                {writable &&
                                  message.kind === "text" &&
                                  (message.delivery === "sent" ||
                                    message.delivery === "stored") && (
                                    <button
                                      onClick={() => {
                                        setReplies((previous) => ({
                                          ...previous,
                                          [roomId]: message,
                                        }));
                                        composer.current?.focus();
                                      }}
                                      aria-label={`Responder a ${message.senderName}`}
                                    >
                                      <Reply size={14} />
                                      Responder
                                    </button>
                                  )}
                              </div>
                            </div>
                          </article>
                        </div>
                      );
                    })}
                    {query && !filtered.length && (
                      <div className="empty-state">
                        <Search size={28} />
                        <h3>Nenhuma mensagem encontrada</h3>
                        <p>
                          Tente outra palavra. A busca inclui apenas as
                          mensagens carregadas.
                        </p>
                      </div>
                    )}
                    {!query && !messages.length && (
                      <div className="empty-state">
                        <MessageCircle size={30} />
                        <h3>
                          {room
                            ? "Toda conversa tem um começo."
                            : "Encontre a sua comunidade."}
                        </h3>
                        <p>
                          {p2p
                            ? "Escreva agora. Conecte outra pessoa para trocar e sincronizar as conversas."
                            : room
                              ? "Compartilhe a primeira ideia neste espaço."
                              : "Crie um espaço ou entre usando um endereço Matrix."}
                        </p>
                        <button
                          className="secondary-button"
                          onClick={() =>
                            p2p
                              ? setModal("peers")
                              : room
                                ? composer.current?.focus()
                                : setModal("join")
                          }
                        >
                          {p2p
                            ? "Conectar pessoa"
                            : room
                              ? "Escrever uma mensagem"
                              : "Entrar em uma comunidade"}
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="composer-wrap">
                    {(error || state.error) && (
                      <div className="error-banner" role="alert">
                        <span>{error || state.error}</span>
                        {error && (
                          <button
                            className="icon-button"
                            aria-label="Dispensar erro"
                            onClick={() => setError("")}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    )}
                    {room?.encrypted && (
                      <div className="inline-note">
                        <LockKeyhole size={18} />
                        <span>
                          Esta sala usa criptografia ponta a ponta. Leitura e
                          envio ainda não são suportados.
                        </span>
                      </div>
                    )}
                    {room && !room.canPost && (
                      <div className="inline-note">
                        Você não tem permissão para publicar nesta comunidade.
                      </div>
                    )}
                    <form className="composer" onSubmit={send}>
                      {reply && (
                        <div className="composer-reply">
                          <Reply size={16} />
                          <div>
                            <strong>Respondendo a {reply.senderName}</strong>
                            <span>{reply.body.slice(0, 100)}</span>
                          </div>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Cancelar resposta"
                            onClick={() =>
                              setReplies((previous) => ({
                                ...previous,
                                [roomId]: undefined,
                              }))
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                      <textarea
                        ref={composer}
                        aria-label="Escrever mensagem"
                        placeholder={
                          room?.encrypted
                            ? "Sala criptografada não suportada"
                            : room
                              ? `Converse em ${room.name}…`
                              : "Entre em uma comunidade para conversar"
                        }
                        value={draft}
                        disabled={!writable}
                        maxLength={MAX_MESSAGE_LENGTH}
                        rows={2}
                        onChange={(event) =>
                          setDrafts((previous) => ({
                            ...previous,
                            [roomId]: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            void send(event);
                          }
                        }}
                      />
                      <div className="composer-footer">
                        <div className="emoji-wrap">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Inserir emoji"
                            aria-expanded={emojiOpen}
                            disabled={!writable}
                            onClick={() => setEmojiOpen(!emojiOpen)}
                          >
                            <Smile size={20} />
                          </button>
                          {emojiOpen && (
                            <div className="emoji-picker">
                              {[
                                "🌱",
                                "💚",
                                "👋",
                                "✨",
                                "🇧🇷",
                                "👍",
                                "💡",
                                "🙌",
                              ].map((emoji) => (
                                <button
                                  type="button"
                                  key={emoji}
                                  aria-label={`Emoji ${emoji}`}
                                  onClick={() => {
                                    setDrafts((previous) => ({
                                      ...previous,
                                      [roomId]:
                                        `${previous[roomId] ?? ""}${emoji}`.slice(
                                          0,
                                          MAX_MESSAGE_LENGTH,
                                        ),
                                    }));
                                    setEmojiOpen(false);
                                    composer.current?.focus();
                                  }}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                          <span className="composer-hint">
                            Enter envia · Shift + Enter quebra a linha
                          </span>
                        </div>
                        <div className="send-controls">
                          {draft.length > 3500 && (
                            <span className="small muted">
                              {draft.length}/4000
                            </span>
                          )}
                          <button
                            className="send-button"
                            aria-label="Enviar mensagem"
                            disabled={!writable || !draft.trim() || sending}
                          >
                            {sending ? (
                              <LoaderCircle size={17} className="spin" />
                            ) : (
                              <Send size={17} />
                            )}
                            <span>Enviar</span>
                          </button>
                        </div>
                      </div>
                    </form>
                    <div className="composer-disclosure">
                      {p2p ? (
                        <>
                          <Network size={12} />
                          Histórico público · salvo aqui e compartilhado com
                          pares · sem confirmação de entrega
                        </>
                      ) : demo ? (
                        <>
                          <span className="local-dot" />
                          Demonstração local · as mensagens ficam neste
                          navegador
                        </>
                      ) : (
                        <>
                          <Globe2 size={12} />
                          {room?.encrypted
                            ? "Envio bloqueado em sala criptografada"
                            : "Sem criptografia ponta a ponta · o servidor pode ler as mensagens"}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>

            <aside className="context-column">
              <div className="community-card">
                <div className="section-label">
                  <span>SOBRE A COMUNIDADE</span>
                  <Globe2 size={16} />
                </div>
                <div className="community-emblem">
                  <Hash size={29} strokeWidth={1.5} />
                </div>
                <h2>{room?.name ?? "Sua rede"}</h2>
                <p>
                  {room?.topic ||
                    "Comece uma conversa e convide outras pessoas para construir junto."}
                </p>
                <div className="community-stats">
                  <span>
                    <Users size={15} />
                    {room?.members ?? 0} participantes
                    {demo && <small> de exemplo</small>}
                  </span>
                  <span>
                    <Globe2 size={15} />
                    {room?.access === "public"
                      ? "Comunidade pública"
                      : room
                        ? "Acesso limitado"
                        : "Rede aberta"}
                  </span>
                </div>
                <button className="card-button" onClick={() => setTab("about")}>
                  Sobre este espaço
                  <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="network-card">
                <div className="section-label">
                  <span>VOCÊ FAZ PARTE DA REDE</span>
                  <Network size={17} />
                </div>
                <h3>
                  Conectada por escolha.
                  <br />
                  Aberta por natureza.
                </h3>
                <p>
                  {p2p
                    ? "Mensagens entre dispositivos. Histórico na sua mão. Cada conexão faz a rede crescer."
                    : "Um protocolo aberto. Servidores independentes. Mais autonomia para cada comunidade."}
                </p>
                <div className="network-status">
                  <span
                    className={
                      demo || state.status === "local"
                        ? "local-dot"
                        : "online-dot"
                    }
                  />
                  <span>
                    {p2p
                      ? peerCount
                        ? `${peerCount} pares conectados`
                        : "Seu dispositivo está pronto"
                      : demo
                        ? "Modo de demonstração"
                        : "Servidor conectado"}
                  </span>
                </div>
                <button onClick={() => setModal("network")}>
                  Como a rede funciona
                  <ArrowRight size={15} />
                </button>
              </div>
              <div className="values-note">
                <Sprout size={18} />
                <p>
                  Sem anúncios. Sem ranking de atenção.
                  <br />
                  Só pessoas e possibilidades.
                </p>
              </div>
              <div className="version-note">RAIZ · PRIMEIRO BROTO · v0.1</div>
            </aside>
          </div>
          <footer className="page-footer">
            <span>Feita para aproximar.</span>
            <span>
              Protocolo aberto <span className="footer-dot">·</span> Futuro
              compartilhado
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal === "peers"
              ? "Conecte outra pessoa."
              : modal === "connect"
                ? "Escolha onde criar raízes."
                : modal === "create"
                  ? "Uma nova comunidade."
                  : modal === "join"
                    ? "Encontre o seu espaço."
                    : "Uma rede que pertence a quem participa."
          }
          close={() => setModal(null)}
        >
          {modal === "peers" && transport instanceof P2PTransport ? (
            <PeerPanel transport={transport} state={state} />
          ) : modal === "connect" ? (
            <ConnectForm connect={connect} />
          ) : modal === "create" || modal === "join" ? (
            <CommunityForm
              mode={modal}
              transport={transport}
              done={(id) => {
                selectRoom(id);
                setModal(null);
              }}
            />
          ) : (
            <>
              <NetworkDetails state={state} />
              {p2p && (
                <button
                  className="secondary-button matrix-option"
                  onClick={() => setModal("connect")}
                >
                  Experimentar conexão Matrix
                </button>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
