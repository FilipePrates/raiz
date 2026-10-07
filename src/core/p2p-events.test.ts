import { describe, expect, it } from "vitest";
import {
  PUBLIC_ROOM_ID,
  createIdentity,
  peerId,
  signEvent,
  verifyEvent,
} from "./p2p-events";

describe("signed peer-to-peer events", () => {
  it("verifies authorship and preserves a stable identity", async () => {
    const identity = await createIdentity("Ana");
    expect(await peerId(identity.publicKey)).toBe(identity.id);
    const event = await signEvent(identity, {
      type: "text",
      roomId: PUBLIC_ROOM_ID,
      body: "Olá, rede!",
      replyTo: undefined,
    });
    const verified = await verifyEvent(JSON.parse(JSON.stringify(event)));
    expect(verified.payload.author).toBe(identity.id);
    expect(verified.payload.body).toBe("Olá, rede!");
    expect(verified.publicKey.d).toBeUndefined();
  });

  it("rejects modified content, a substituted identity, and invalid signatures", async () => {
    const first = await createIdentity("Ana");
    const second = await createIdentity("João");
    const event = await signEvent(first, {
      type: "text",
      roomId: PUBLIC_ROOM_ID,
      body: "Original",
    });
    await expect(
      verifyEvent({
        ...event,
        payload: { ...event.payload, body: "Alterado" },
      }),
    ).rejects.toThrow();
    await expect(
      verifyEvent({ ...event, publicKey: second.publicKey }),
    ).rejects.toThrow();
    await expect(
      verifyEvent({ ...event, signature: "AA==" }),
    ).rejects.toThrow();
  });

  it("accepts a community definition and refuses overwriting the shared default community", async () => {
    const identity = await createIdentity("Ana");
    const roomId = `!${identity.id.slice(1, 33)}-${crypto.randomUUID()}:raiz`;
    const event = await signEvent(identity, {
      type: "room",
      roomId,
      body: "Clube do bairro",
      topic: "Ideias locais",
    });
    expect((await verifyEvent(event)).payload.roomId).toBe(roomId);
    const anotherIdentity = await createIdentity("João");
    const forged = await signEvent(anotherIdentity, {
      type: "room",
      roomId,
      body: "Nome forjado",
    });
    await expect(verifyEvent(forged)).rejects.toThrow("Definição");
    const invalid = await signEvent(identity, {
      type: "room",
      roomId: PUBLIC_ROOM_ID,
      body: "Outra praça",
    });
    await expect(verifyEvent(invalid)).rejects.toThrow("Definição");
  });

  it("rejects oversized payloads and does not retain private or additional received fields", async () => {
    const identity = await createIdentity("Ana");
    const oversized = await signEvent(identity, {
      type: "text",
      roomId: PUBLIC_ROOM_ID,
      body: "a".repeat(4001),
    });
    await expect(verifyEvent(oversized)).rejects.toThrow();
    const event = await signEvent(identity, {
      type: "text",
      roomId: PUBLIC_ROOM_ID,
      body: "Olá",
    });
    const clean = await verifyEvent({
      ...event,
      extra: "untrusted",
      publicKey: { ...event.publicKey, d: "must-not-persist" },
    });
    expect(clean).not.toHaveProperty("extra");
    expect(clean.publicKey).not.toHaveProperty("d");
  });
});
