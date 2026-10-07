import { expect, test } from "@playwright/test";

test("sends and safely renders text, persists it, and keeps drafts per community", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Praça aberta.",
  );
  const composer = page.getByRole("textbox", { name: "Escrever mensagem" });
  await composer.fill('<img src=x onerror="alert(1)"> Olá, rede!');
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(
    page
      .locator(".message-content")
      .getByText('<img src=x onerror="alert(1)"> Olá, rede!', { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".message-content img")).toHaveCount(0);
  await composer.fill("Rascunho da praça");
  await page
    .getByRole("button", { name: "Tecnologia livre", exact: true })
    .click();
  await expect(composer).toHaveValue("");
  await composer.fill("Rascunho da tecnologia");
  await page.getByRole("button", { name: "Praça aberta", exact: true }).click();
  await expect(composer).toHaveValue("Rascunho da praça");
  await page.reload();
  await expect(
    page
      .locator(".message-content")
      .getByText('<img src=x onerror="alert(1)"> Olá, rede!', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("creates a community, replies, and searches the loaded conversation", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await page
    .getByRole("button", { name: "Criar comunidade", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Nome da comunidade" })
    .fill("Clube do bairro");
  await page
    .getByRole("textbox", { name: "Sobre este espaço" })
    .fill("Ideias para nossa comunidade.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Criar comunidade" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Clube do bairro.",
  );
  const composer = page.getByRole("textbox", { name: "Escrever mensagem" });
  await composer.fill("Primeira ideia");
  await composer.press("Enter");
  await page.getByRole("button", { name: "Responder a Você" }).click();
  await expect(page.locator(".composer-reply")).toContainText("Primeira ideia");
  await composer.fill("Podemos construir juntos");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator(".reply-quote")).toContainText("Primeira ideia");
  await page.getByRole("searchbox").fill("construir");
  await expect(page.locator(".message")).toHaveCount(1);
  await page.getByRole("searchbox").fill("não existe");
  await expect(
    page.getByRole("heading", { name: "Nenhuma mensagem encontrada" }),
  ).toBeVisible();
});

test("rejects insecure homeservers before sending credentials", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Conectar servidor" }).click();
  await page
    .getByRole("textbox", { name: "Servidor Matrix" })
    .fill("http://untrusted.example");
  await page.getByRole("textbox", { name: "Usuário" }).fill("alice");
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Conectar ao servidor" }).click();
  await expect(page.getByRole("alert")).toContainText("Use HTTPS");
  await expect(page.locator(".connection-label")).toContainText(
    "Demonstração local",
  );
});

test("works on a narrow screen and restores focus after closing a dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?demo=1");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page
    .getByRole("button", { name: "Cultura & território", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Cultura & território.",
  );
  await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
  await page.getByRole("button", { name: "Conectar servidor" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Conectar servidor" }),
  ).toBeFocused();
});
