# Raiz

[Como clonar, executar e conectar em português](docs/COMECAR.md) · [Mensagem pronta para compartilhar](docs/MENSAGEM-CONVITE.md)

A first working experiment for a Brazilian communication network. The product goal is adoption and community control: familiar conversations, independently operated infrastructure, transparent rules, and no attention ranking or advertising in the client.

**Current implementation:** a local-first, browser-to-browser text prototype using WebRTC. There is also a separate Matrix adapter. Neither transport currently integrates with MSG Gov.

## Run

```sh
nvm use
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Node.js 22.12+ is required. The default mode is real P2P, with an initially empty public community. Your device identity and signed history are saved in IndexedDB.

For an explicitly labeled, fictitious interface demonstration, open <http://127.0.0.1:5173/?demo=1>. Demo data is separate from P2P data.

## Try actual P2P communication

1. Open the app in **two different browser profiles, two different browsers, or two devices**. Two ordinary tabs share an identity; a browser lock prevents using it concurrently.
2. In each browser, select **Conectar pessoa** and set a display name.
3. Person A selects **Criar convite P2P** and sends the full code to B through a channel they already trust. Keep A's page open.
4. Person B selects **Receber convite**, pastes the code, selects **Gerar resposta**, and sends the response to A. Keep B's page open.
5. A pastes the response and selects **Concluir conexão**. Wait for a connected peer to appear.
6. Close the dialogs and exchange messages. Existing public history synchronizes in both directions. A peer can forward signed events to another connected peer.
7. Reload one page, write a message while disconnected, then pair again. The local identity and history survive a reload; missing events synchronize on reconnection.

There are no default STUN servers, TURN servers, signaling services, identity services, remote fonts, analytics, or message backends in P2P mode. Same-machine or same-LAN pairing is the first test. Some Internet connections will require your own or explicitly chosen STUN/TURN servers; configure those under **Conexão pela Internet** before creating or accepting an invitation. The interface reports direct versus relayed connections when browser statistics provide that information.

WebRTC and Web Crypto require **HTTPS or localhost**. A plain HTTP LAN address is insufficient for another device. To test two devices, serve the static build over trusted HTTPS. No public deployment has been configured.

## What is implemented

- Portuguese interface, chronological community conversations, per-room drafts, replies, local search, emoji insertion, and responsive navigation.
- Device-generated P-256 identity, event hashes, ECDSA signatures, and validation of incoming events and signed pairing codes using native Web Crypto.
- Durable local storage before an event enters the visible timeline or is forwarded.
- Reliable, ordered WebRTC data channels, bounded frames, queue limits, and send-buffer backpressure.
- Missing-event inventory exchange, deduplication, deterministic timeline ordering, and forwarding through connected peers.
- Public community creation and replication. The built-in Praça aberta is common to every device.
- Export of the local identity and history. The JSON export includes the private key and must be kept private; import/recovery UI is still pending.
- Optional Matrix password login, joined room sync, room creation/joining, text/replies, and history pagination. Access tokens stay in memory; encrypted-room sending is blocked.

## Prototype boundaries

This is a transport and product experiment, **not a ready public service for 100 users**.

All P2P communities and their complete histories are shared with every connected peer. Signatures establish which device key signed an event; they do not verify a person's real identity. Names are not unique. WebRTC encrypts each link with DTLS, but public messages are readable on receiving devices and can be forwarded. There is no group E2EE, access control, moderation, deletion/redaction, or private messaging yet.

Messages are marked as stored locally, not acknowledged as delivered to anyone. Disconnected devices can write to their local logs. Delivery requires a later connection to a peer carrying the missing events; there is no guaranteed offline mailbox, automatic reconnection, or push notification. Reloading drops connections and requires a new pairing. The application shell is not yet cached for offline reloads.

Clearing browser storage can lose the identity and history. Storage is not encrypted at rest. Backup import, identity migration, and recovery remain required pilot work. This experimental protocol is `raiz.events.v1`, not Matrix, and does not have a stable external compatibility promise.

Pilot limits: 8 simultaneous peer links, 100 communities, 2,000 messages per community, 10,000 total log events, 4,000 text characters, 24 KB wire frames, 100 inventory IDs per frame, and bounded queues. These limits constrain the experiment; there is no million-user scalability claim. Discovery and room-scoped replication will be needed before broad use.

## Optional Matrix experiment

P2P is the default. To test the separate Matrix adapter, select **Como a rede funciona → Experimentar conexão Matrix**, or use the demo's **Conectar servidor** button. A password-login-enabled Matrix homeserver and an existing account are required.

A local, isolated Synapse/PostgreSQL setup is included:

```sh
npm run matrix:setup
npm run matrix:up
npm run matrix:user
```

Use `http://localhost:8008` in the connection form. Accounts are `@username:localhost`. Configuration generates random secrets, disables public registration and outgoing federation, binds the host API to loopback, and disables statistics reporting. It uses a Docker named volume for PostgreSQL. `npm run matrix:down` stops the stack without deleting its data.

This is a development configuration. Public Matrix operation needs a permanent server name, HTTPS, controlled registration, moderation, backups, and an explicit federation policy. Sovereignty does not guarantee that federated room copies remain in Brazil: that depends on participating servers. Do not expose the included local configuration directly to the Internet.

The Matrix adapter has not been tested against a running homeserver in this workspace; its build and event boundary tests are covered. The P2P browser tests exercise real WebRTC connections.

## Validation

```sh
npm run build
npm test
npm run test:e2e
```

Browser tests use system Chrome when available. Set `CHROME_PATH` to a Chromium-compatible executable, or install Playwright Chromium with `npx playwright install chromium`. The tests use isolated browser contexts and need permission to bind a local HTTP server and open local WebRTC sockets.

See [the product and pilot strategy](docs/STRATEGY.md), [the architecture](docs/ARCHITECTURE.md), and [the staged roadmap](docs/ROADMAP.md).

The project is private and a distribution license has not yet been selected. Dependencies retain their own licenses.
