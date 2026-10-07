# Como começar na Raiz

A Raiz é um protótipo de comunicação entre dispositivos. Você pode escrever mensagens, criar comunidades públicas e conectar outra pessoa para sincronizar as conversas. O modo P2P não exige um servidor de contas ou de mensagens.

## Clonar e executar

Você precisa de Git e Node.js 22.12 ou superior, com npm. Se já usa nvm, os comandos abaixo selecionam a versão indicada pelo projeto.

Se você recebeu o arquivo **raiz.bundle**, salve-o no computador e abra o terminal na pasta onde ele está. Esse arquivo contém uma cópia clonável do repositório, sem exigir uma plataforma de hospedagem:

```sh
git clone raiz.bundle raiz
cd raiz
nvm install
nvm use
npm ci
npm run dev
```

Se recebeu um endereço de servidor Git, substitua `URL_DO_REPOSITORIO` pelo endereço informado por quem compartilhou o projeto:

```sh
git clone URL_DO_REPOSITORIO raiz
cd raiz
nvm install
nvm use
npm ci
npm run dev
```

Se instalou Node.js diretamente, pule os comandos `nvm install` e `nvm use`. Confira a versão com `node --version`.

Abra <http://127.0.0.1:5173/> no navegador. Mantenha o terminal aberto enquanto estiver usando o aplicativo. Para parar, pressione `Ctrl+C` no terminal.

O repositório foi iniciado localmente. Ainda não existe uma URL pública configurada. Um bundle é uma cópia do histórico no momento da exportação; ele não recebe atualizações automaticamente. Para clonar uma segunda cópia neste mesmo computador, você também pode usar:

```sh
git clone /home/filipe/Desktop/forum /tmp/raiz-teste
cd /tmp/raiz-teste
npm ci
```

Não é necessário executar uma segunda cópia para testar duas pessoas no mesmo computador: ambas podem abrir o endereço do aplicativo em navegadores ou perfis diferentes. Se executar duas cópias ao mesmo tempo, a segunda precisa de outra porta, por exemplo `npm run dev -- --port 5174`.

## Conectar duas pessoas

Para começar, teste no mesmo computador usando **dois navegadores ou dois perfis diferentes**. Duas abas comuns do mesmo perfil compartilham a identidade local e não funcionam como duas pessoas.

1. Nos dois navegadores, abra a Raiz e clique em **Conectar pessoa**. Informe seu nome e clique em **Salvar nome**.
2. A primeira pessoa clica em **Criar convite P2P**, copia o código completo e envia para a segunda por um canal de confiança.
3. A segunda pessoa clica em **Receber convite**, cola o código e clica em **Gerar resposta**.
4. A segunda pessoa copia **Sua resposta P2P** e envia o código de volta para a primeira.
5. A primeira pessoa cola a resposta no campo **Resposta do convite** e clica em **Concluir conexão**.
6. Aguardem aparecer uma pessoa conectada. Fechem a janela de conexão e conversem na **Praça aberta**.

Mantenham as páginas abertas durante a conexão. Convites pendentes expiram; se demorar, gere outro. Ao recarregar a página, será necessário conectar novamente. A identidade e as mensagens permanecem no navegador enquanto seus dados locais forem preservados.

## Testar em computadores ou celulares diferentes

Cada computador pode clonar o projeto e executar sua própria cópia em `localhost`. Para abrir o aplicativo de um computador pelo celular, a página precisa ser servida por **HTTPS com certificado confiável**. Abrir apenas um endereço como `http://192.168.1.10:5173` não atende aos requisitos de segurança do navegador.

Na Internet, a conexão pode exigir servidores STUN/TURN. A Raiz não configura serviços externos por padrão. Em **Conectar pessoa → Conexão pela Internet · STUN / TURN**, informe servidores que você opera ou escolheu antes de criar ou receber um convite. Exemplo de formato, com endereço fictício:

```json
[{ "urls": "stun:seu-servidor.br:3478" }]
```

Algumas redes precisam de TURN para retransmitir a conexão. Esse servidor precisa existir e estar configurado; preencher um endereço de exemplo não cria o serviço.

## Antes de compartilhar conversas

Este protótipo trabalha com **comunidades públicas**: todas as comunidades e seus históricos são compartilhados com todos os pares conectados. Convide apenas pessoas com quem deseja compartilhar esses dados. Mensagens privadas e controle de acesso ainda não estão disponíveis.

As mensagens são salvas localmente. A conexão sincroniza o histórico entre pares; ainda não há confirmação de entrega ou entrega garantida para quem está offline. Apagar os dados do navegador pode apagar sua identidade e suas conversas.

## Atualizar e verificar

Depois de configurar um servidor Git compartilhado, para obter novas versões:

```sh
git pull --ff-only
npm ci
```

Para verificar o projeto:

```sh
npm run build
npm test
```

Os testes de navegador podem ser executados com `npm run test:e2e`; consulte o [README](../README.md) para os requisitos do Chrome ou Chromium.
