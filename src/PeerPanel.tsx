import { useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Download,
  Link2,
  LoaderCircle,
  Network,
  Plus,
  Unplug,
} from "lucide-react";
import type { NetworkSnapshot } from "./core/types";
import type { P2PTransport } from "./core/p2p";

function CodeBox({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  return (
    <label className="code-box">
      {label}
      <textarea
        aria-label={label}
        value={code}
        readOnly
        rows={3}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button
        type="button"
        className="secondary-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setError("");
          } catch {
            setError("Selecione e copie o código manualmente.");
          }
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? "Copiado" : "Copiar código"}
      </button>
      {error && <span className="small muted">{error}</span>}
    </label>
  );
}

export default function PeerPanel({
  transport,
  state,
}: {
  transport: P2PTransport;
  state: NetworkSnapshot;
}) {
  const [flow, setFlow] = useState<"offer" | "accept" | null>(null);
  const [offer, setOffer] = useState<{ id: string; code: string } | null>(null);
  const [answer, setAnswer] = useState<{ id: string; code: string } | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ice, setIce] = useState("[]");
  const [name, setName] = useState(state.user.name);
  const connected =
    state.peers?.filter((peer) => peer.status === "connected") ?? [];

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a conexão.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startOffer() {
    await perform(async () => {
      if (offer) transport.removePeer(offer.id);
      setOffer(null);
      setAnswer(null);
      setInput("");
      transport.configureIceServers(ice);
      const next = await transport.createOffer();
      setOffer(next);
      setFlow("offer");
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await perform(async () => {
      if (flow === "offer" && offer) {
        await transport.completeOffer(offer.id, input);
        setNotice("Resposta aceita. Aguarde a conexão aparecer abaixo.");
        setInput("");
        setFlow(null);
      } else {
        if (answer) transport.removePeer(answer.id);
        transport.configureIceServers(ice);
        setAnswer(await transport.acceptOffer(input));
        setInput("");
      }
    });
  }

  return (
    <div className="peer-panel form-stack">
      <div className="p2p-summary">
        <Network size={26} />
        <div>
          <strong>
            {connected.length}{" "}
            {connected.length === 1 ? "pessoa conectada" : "pessoas conectadas"}
          </strong>
          <span>Seu histórico fica no seu dispositivo.</span>
        </div>
      </div>
      <p className="muted">
        Conecte dois navegadores trocando um convite e uma resposta. Use perfis
        diferentes, dois navegadores ou dois dispositivos. Sem servidor de
        contas ou mensagens.
      </p>
      <div className="inline-note">
        Todas as comunidades deste protótipo são públicas e seu histórico é
        compartilhado com cada participante conectado. Convide apenas pessoas
        com quem deseja compartilhar estes dados.
      </div>
      <form
        className="profile-form"
        onSubmit={(event) => {
          event.preventDefault();
          void perform(async () => {
            await transport.setDisplayName(name);
            setNotice(
              "Nome atualizado para suas próximas mensagens e convites.",
            );
          });
        }}
      >
        <label>
          Seu nome
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            disabled={busy}
          />
        </label>
        <button className="secondary-button" disabled={busy}>
          Salvar nome
        </button>
      </form>
      <div className="peer-actions">
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => {
            void startOffer();
          }}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Plus size={16} />
          )}
          Criar convite P2P
        </button>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => {
            setFlow("accept");
            setInput("");
            setError("");
            setAnswer(null);
          }}
        >
          Receber convite
        </button>
      </div>
      {flow === "offer" && offer && (
        <>
          <p className="step-description">
            <b>1.</b> Envie este convite para a outra pessoa. Mantenha esta
            página aberta.
          </p>
          <CodeBox label="Seu convite P2P" code={offer.code} />
          <form onSubmit={submit} className="form-stack">
            <label>
              <b>2.</b> Cole a resposta recebida
              <textarea
                aria-label="Resposta do convite"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                required
                rows={3}
                maxLength={100_000}
                disabled={busy}
              />
            </label>
            <button className="primary-button" disabled={busy || !input.trim()}>
              <Link2 size={16} />
              Concluir conexão
            </button>
          </form>
        </>
      )}
      {flow === "accept" && !answer && (
        <form onSubmit={submit} className="form-stack">
          <label>
            Convite recebido
            <textarea
              aria-label="Convite recebido"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              required
              rows={3}
              maxLength={100_000}
              disabled={busy}
            />
          </label>
          <button className="primary-button" disabled={busy || !input.trim()}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Link2 size={16} />
            )}
            Gerar resposta
          </button>
        </form>
      )}
      {flow === "accept" && answer && (
        <>
          <p className="step-description">
            Envie esta resposta para quem criou o convite. A outra pessoa deve
            colá-la em “Concluir conexão”. Mantenha esta página aberta.
          </p>
          <CodeBox label="Sua resposta P2P" code={answer.code} />
        </>
      )}
      {(error || notice) && (
        <p
          className={error ? "form-error" : "small muted"}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </p>
      )}
      {!!state.peers?.length && (
        <div className="peer-list">
          {state.peers.map((peer) => (
            <div key={peer.id} className="peer-row">
              <div>
                <strong>{peer.name}</strong>
                <span>
                  {peer.status === "connected"
                    ? peer.connection === "relay"
                      ? "Conectado por relay"
                      : peer.connection === "direct"
                        ? "Conexão direta"
                        : "Conectado"
                    : "Aguardando conexão…"}
                </span>
              </div>
              <button
                className="icon-button"
                aria-label={`Desconectar ${peer.name}`}
                onClick={() => transport.removePeer(peer.id)}
              >
                <Unplug size={17} />
              </button>
            </div>
          ))}
        </div>
      )}
      <details className="ice-details">
        <summary>Conexão pela Internet · STUN / TURN</summary>
        <p className="small muted">
          Sem configuração, a conexão pode funcionar na mesma rede. Para
          conectar redes diferentes, informe servidores STUN/TURN que você opera
          ou escolhe. Um TURN retransmite dados quando a conexão direta não é
          possível.
        </p>
        <label>
          Servidores ICE (JSON)
          <textarea
            aria-label="Servidores ICE"
            value={ice}
            onChange={(event) => setIce(event.target.value)}
            rows={4}
            placeholder={'[{"urls":"stun:seu-servidor.br:3478"}]'}
          />
        </label>
        <p className="small muted">
          Exemplo TURN:{" "}
          {`[{"urls":"turn:seu-servidor.br:3478","username":"usuario","credential":"senha"}]`}
          . A configuração vale para os próximos convites e não é salva.
        </p>
      </details>
      <details className="ice-details">
        <summary>Sua identidade e exportação</summary>
        <p className="small muted">ID derivado da sua chave pública:</p>
        <code className="identity-code">{state.user.id}</code>
        <p className="small muted">
          Limpar os dados do navegador pode apagar sua identidade e seu
          histórico. A exportação inclui a chave privada em texto legível:
          guarde o arquivo em um local privado. Importação e recuperação guiada
          ainda estão no roteiro.
        </p>
        <button
          className="secondary-button"
          onClick={() => {
            void perform(() => transport.exportBackup());
          }}
        >
          <Download size={15} />
          Exportar identidade e histórico
        </button>
      </details>
      <p className="small muted">
        Convites revelam endereços de rede e expiram. WebRTC cifra a conexão; as
        conversas públicas ficam legíveis nos dispositivos e podem ser
        encaminhadas por pares. Recarregar a página exige parear novamente.
      </p>
    </div>
  );
}
