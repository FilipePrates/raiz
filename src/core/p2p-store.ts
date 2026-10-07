import type { PeerIdentity, SignedEvent } from "./p2p-events";

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Armazenamento interrompido."));
    transaction.onerror = () => reject(transaction.error);
  });
}

export class PeerStore {
  private constructor(private db: IDBDatabase) {}

  static async open(): Promise<PeerStore> {
    const request = indexedDB.open("raiz.p2p.v1", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("identity");
      request.result.createObjectStore("events", { keyPath: "id" });
    };
    const db = await result(request);
    db.onversionchange = () => db.close();
    return new PeerStore(db);
  }

  async loadIdentity(): Promise<PeerIdentity | undefined> {
    return result(
      this.db.transaction("identity").objectStore("identity").get("self"),
    );
  }
  async loadEvents(): Promise<SignedEvent[]> {
    return result(this.db.transaction("events").objectStore("events").getAll());
  }

  async saveIdentity(identity: PeerIdentity) {
    const transaction = this.db.transaction("identity", "readwrite");
    const done = committed(transaction);
    transaction.objectStore("identity").put(identity, "self");
    await done;
  }

  async saveEvent(event: SignedEvent) {
    const transaction = this.db.transaction("events", "readwrite");
    const done = committed(transaction);
    transaction.objectStore("events").put(event);
    await done;
  }

  close() {
    this.db.close();
  }
}
