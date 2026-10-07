import { expect, test, type Page } from "@playwright/test";

async function pair(creator: Page, receiver: Page) {
  await creator
    .getByRole("button", { name: "Conectar pessoa", exact: true })
    .first()
    .click();
  await creator.getByRole("button", { name: "Criar convite P2P" }).click();
  const invitation = creator.getByRole("textbox", {
    name: "Seu convite P2P",
    exact: true,
  });
  await expect(invitation).toBeVisible();
  const code = await invitation.inputValue();
  await receiver
    .getByRole("button", { name: "Conectar pessoa", exact: true })
    .first()
    .click();
  await receiver.getByRole("button", { name: "Receber convite" }).click();
  await receiver.getByRole("textbox", { name: "Convite recebido" }).fill(code);
  await receiver.getByRole("button", { name: "Gerar resposta" }).click();
  const response = receiver.getByRole("textbox", {
    name: "Sua resposta P2P",
    exact: true,
  });
  await expect(response).toBeVisible();
  await creator
    .getByRole("textbox", { name: "Resposta do convite" })
    .fill(await response.inputValue());
  await creator.getByRole("button", { name: "Concluir conexão" }).click();
  await expect(creator.locator(".p2p-summary strong")).toHaveText(
    /^[1-8] pessoas? conectadas?$/,
  );
  await expect(receiver.locator(".p2p-summary strong")).toHaveText(
    /^[1-8] pessoas? conectadas?$/,
  );
  await creator.getByRole("button", { name: "Fechar", exact: true }).click();
  await receiver.getByRole("button", { name: "Fechar", exact: true }).click();
}

async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Escrever mensagem" }).fill(text);
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(
    page.locator(".message-content > p").getByText(text, { exact: true }),
  ).toBeVisible();
}

test("real WebRTC peers exchange text, replicate through a third peer, and recover offline history", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [ana, joao, luiza] = pages;
  const errors: string[] = [];
  const externalRequests: string[] = [];
  for (const [index, page] of pages.entries()) {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (!request.url().startsWith("http://127.0.0.1:5173"))
        externalRequests.push(request.url());
    });
    await page.goto("/");
    await expect(page.locator(".connection-label")).toHaveText(
      "P2P · salvo localmente",
    );
    await page
      .getByRole("button", { name: "Conectar pessoa", exact: true })
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "Seu nome", exact: true })
      .fill(["Ana", "João", "Luiza"][index]);
    await page.getByRole("button", { name: "Salvar nome" }).click();
    await expect(page.getByRole("status")).toContainText("Nome atualizado");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
  }
  await send(ana, "Escrevi antes de conectar.");
  await pair(ana, joao);
  await expect(
    joao
      .locator(".message-content > p")
      .getByText("Escrevi antes de conectar.", { exact: true }),
  ).toBeVisible();
  await send(joao, "Recebi pelo canal P2P.");
  await expect(
    ana
      .locator(".message-content > p")
      .getByText("Recebi pelo canal P2P.", { exact: true }),
  ).toBeVisible();
  await ana
    .getByRole("button", { name: "Criar comunidade", exact: true })
    .first()
    .click();
  await ana
    .getByRole("textbox", { name: "Nome da comunidade" })
    .fill("Comunidade entre pares");
  await ana
    .getByRole("textbox", { name: "Sobre este espaço" })
    .fill("Criada e compartilhada pelo canal direto.");
  await ana
    .getByRole("dialog")
    .getByRole("button", { name: "Criar comunidade" })
    .click();
  await expect(
    joao.getByRole("button", { name: "Comunidade entre pares", exact: true }),
  ).toBeVisible();
  await joao
    .getByRole("button", { name: "Comunidade entre pares", exact: true })
    .click();
  await send(ana, "Esta comunidade não tem servidor de mensagens.");
  await expect(
    joao
      .locator(".message-content > p")
      .getByText("Esta comunidade não tem servidor de mensagens.", {
        exact: true,
      }),
  ).toBeVisible();
  await ana.getByRole("button", { name: "Praça aberta", exact: true }).click();
  await joao.getByRole("button", { name: "Praça aberta", exact: true }).click();
  await pair(joao, luiza);
  await expect(
    luiza
      .locator(".message-content > p")
      .getByText("Escrevi antes de conectar.", { exact: true }),
  ).toBeVisible();
  await send(ana, "Ana para Luiza, passando por João.");
  await expect(
    luiza
      .locator(".message-content > p")
      .getByText("Ana para Luiza, passando por João.", { exact: true }),
  ).toBeVisible();
  await expect(
    luiza
      .locator(".message-content > p")
      .getByText("Ana para Luiza, passando por João.", { exact: true }),
  ).toHaveCount(1);
  // Reload drops peer connections but retains the IndexedDB identity and event log.
  await luiza.reload();
  await expect(luiza.locator(".connection-label")).toHaveText(
    "P2P · salvo localmente",
  );
  await expect(luiza.locator(".profile strong")).toHaveText("Luiza");
  await expect(
    luiza
      .locator(".message-content > p")
      .getByText("Ana para Luiza, passando por João.", { exact: true }),
  ).toBeVisible();
  await send(luiza, "Escrevi offline.");
  await pair(joao, luiza);
  await expect(
    ana
      .locator(".message-content > p")
      .getByText("Escrevi offline.", { exact: true }),
  ).toBeVisible();
  await expect(
    ana
      .locator(".message-content > p")
      .getByText("Escrevi antes de conectar.", { exact: true }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  await Promise.all(contexts.map((context) => context.close()));
});

test("one identity cannot run concurrently in two tabs of the same profile", async ({
  context,
}) => {
  const first = await context.newPage();
  await first.goto("/");
  await expect(first.locator(".connection-label")).toHaveText(
    "P2P · salvo localmente",
  );
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByRole("alert")).toContainText(
    "já está aberta neste perfil",
  );
  await expect(second.locator(".connection-label")).toHaveText(
    "Demonstração local",
  );
});
