import { describe, expect, it, vi } from "vitest";
import type { MatrixEvent, Room } from "matrix-js-sdk";
import { DEMO_STORAGE_KEY, DemoTransport } from "./demo";
import { messageFromEvent, normalizeHomeserver } from "./matrix-events";

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

describe("local prototype", () => {
  it("persists messages, replies, and communities across a restart", async () => {
    const storage = memoryStorage();
    const demo = new DemoTransport(storage);
    const id = await demo.createRoom({
      name: "  Comunidade nova  ",
      topic: " Olá! ",
    });
    await demo.sendText(id, "  Primeira mensagem  ");
    const first = demo.getSnapshot().messages[id][0];
    await demo.sendText(id, "Uma resposta", first.id);
    const restored = new DemoTransport(storage).getSnapshot();
    expect(restored.rooms.find((room) => room.id === id)?.name).toBe(
      "Comunidade nova",
    );
    expect(restored.messages[id][0].body).toBe("Primeira mensagem");
    expect(restored.messages[id][1].replyTo).toBe(first.id);
  });

  it("rejects empty, oversized, or misrouted messages", async () => {
    const demo = new DemoTransport();
    const id = demo.getSnapshot().rooms[0].id;
    await expect(demo.sendText(id, " ")).rejects.toThrow();
    await expect(demo.sendText(id, "a".repeat(4001))).rejects.toThrow();
    await expect(demo.sendText("!unknown:demo", "Olá")).rejects.toThrow();
    await expect(demo.sendText(id, "Olá", "$unknown")).rejects.toThrow();
  });

  it("keeps existing state when browser persistence fails", async () => {
    const demo = new DemoTransport({
      getItem: () => null,
      setItem: () => {
        throw new Error("storage full");
      },
    });
    const before = demo.getSnapshot();
    await expect(
      demo.sendText(before.rooms[0].id, "Não deve desaparecer"),
    ).rejects.toThrow("storage full");
    expect(demo.getSnapshot()).toBe(before);
  });

  it("recovers from corrupted and incomplete local caches", () => {
    const storage = memoryStorage();
    storage.setItem(DEMO_STORAGE_KEY, "{invalid");
    expect(new DemoTransport(storage).getSnapshot().rooms).toHaveLength(4);
    storage.setItem(
      DEMO_STORAGE_KEY,
      JSON.stringify({ mode: "demo", rooms: [{}], messages: {} }),
    );
    expect(new DemoTransport(storage).getSnapshot().rooms).toHaveLength(4);
  });

  it("notifies active subscribers and removes unsubscribed listeners", async () => {
    const demo = new DemoTransport();
    const listener = vi.fn();
    const unsubscribe = demo.subscribe(listener);
    await demo.sendText(demo.getSnapshot().rooms[0].id, "Olá");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await demo.sendText(demo.getSnapshot().rooms[0].id, "Outra");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("Matrix boundaries", () => {
  it("requires HTTPS except on a loopback development server", () => {
    expect(normalizeHomeserver(" https://matrix.example.br/ ")).toBe(
      "https://matrix.example.br",
    );
    expect(normalizeHomeserver("http://localhost:8008")).toBe(
      "http://localhost:8008",
    );
    expect(() => normalizeHomeserver("http://matrix.example.br")).toThrow(
      "HTTPS",
    );
    expect(() => normalizeHomeserver("javascript:alert(1)")).toThrow();
    expect(() =>
      normalizeHomeserver("https://user:secret@example.br"),
    ).toThrow();
    expect(() =>
      normalizeHomeserver("https://example.br/?access_token=secret"),
    ).toThrow();
  });

  const room = {
    roomId: "!room:example.br",
    getMember: () => ({ name: "Maria" }),
  } as unknown as Room;
  function event(
    type: string,
    content: Record<string, unknown>,
    redacted = false,
  ) {
    return {
      getType: () => type,
      getContent: () => content,
      isRedacted: () => redacted,
      getId: () => "$event",
      getSender: () => "@maria:example.br",
      getTs: () => 1234,
      status: null,
    } as unknown as MatrixEvent;
  }

  it("preserves plain text without trusting formatted HTML and removes reply fallback", () => {
    const result = messageFromEvent(
      event("m.room.message", {
        msgtype: "m.text",
        body: "> <@joao:example.br> original\n\nResposta",
        formatted_body: "<script>bad()</script>",
        "m.relates_to": { "m.in_reply_to": { event_id: "$original" } },
      }),
      room,
    );
    expect(result?.body).toBe("Resposta");
    expect(result?.replyTo).toBe("$original");
    expect(result?.senderName).toBe("Maria");
  });

  it("recognizes encrypted messages and excludes redacted messages and replacement events", () => {
    expect(
      messageFromEvent(
        event("m.room.encrypted", { ciphertext: "secret" }),
        room,
      )?.kind,
    ).toBe("encrypted");
    expect(
      messageFromEvent(
        event("m.room.message", { body: "deleted" }, true),
        room,
      ),
    ).toBeUndefined();
    expect(
      messageFromEvent(
        event("m.room.message", { "m.relates_to": { rel_type: "m.replace" } }),
        room,
      ),
    ).toBeUndefined();
  });

  it("preserves standard media references without automatically fetching external URLs", () => {
    const result = messageFromEvent(
      event("m.room.message", {
        body: "Foto",
        msgtype: "m.image",
        url: "mxc://example.br/media",
        info: { mimetype: "image/png", w: 100 },
      }),
      room,
    );
    expect(result?.media?.uri).toBe("mxc://example.br/media");
    expect(result?.kind).toBe("image");
    expect(
      messageFromEvent(
        event("m.room.message", {
          body: "Foto",
          msgtype: "m.image",
          url: "https://tracking.example/image",
        }),
        room,
      )?.media,
    ).toBeUndefined();
  });
});
