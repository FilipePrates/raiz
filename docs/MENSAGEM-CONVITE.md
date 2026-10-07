# Mensagem para compartilhar

Envie a mensagem abaixo junto com o arquivo **raiz.bundle**. Esse arquivo permite clonar o repositório sem um servidor Git. Quando houver um endereço remoto, você poderá substituir `raiz.bundle` por esse endereço no comando `git clone`.

---

Pessoal, comecei a construir a **Raiz**, um protótipo de comunicação para experimentar uma rede com mais autonomia para as nossas comunidades. Nesta primeira versão, dá para trocar mensagens de texto e criar comunidades públicas usando uma conexão P2P entre navegadores.

Para testar, instale Git e Node.js 22.12 ou superior. Salve o arquivo **raiz.bundle** que estou compartilhando e abra um terminal na pasta onde ele está. Depois rode:

```sh
git clone raiz.bundle raiz
cd raiz
npm ci
npm run dev
```

Se você usa nvm, rode `nvm install` e `nvm use` dentro da pasta antes de instalar as dependências.

Abra **http://127.0.0.1:5173/**. Para conectar com outra pessoa:

1. Os dois clicam em **Conectar pessoa**, escolhem um nome e salvam.
2. Uma pessoa clica em **Criar convite P2P** e envia o código completo para a outra.
3. A outra clica em **Receber convite**, cola o código e clica em **Gerar resposta**. Depois envia a resposta de volta.
4. Quem criou o convite cola a resposta e clica em **Concluir conexão**.
5. Quando aparecer uma pessoa conectada, fechem a janela de conexão e conversem na **Praça aberta**.

Para o primeiro teste, use dois navegadores ou perfis diferentes no mesmo computador. Duas abas do mesmo perfil não são duas pessoas. Mantenham as páginas abertas. Para conectar redes diferentes pela Internet, pode ser necessário configurar STUN/TURN; para acessar pelo celular um servidor de outro computador, a página precisa de HTTPS.

**É um protótipo com conversas públicas:** todos os pares conectados recebem todas as comunidades e seus históricos. Ainda não há mensagens privadas nem entrega garantida para quem está offline. A ideia agora é testar, encontrar problemas e construir algo útil juntos.

O passo a passo completo está em **docs/COMECAR.md** no repositório.
