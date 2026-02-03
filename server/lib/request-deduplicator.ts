import crypto from "crypto";

export class RequestDeduplicator {
  private pending = new Map<string, Promise<unknown>>();
  private ttlMs: number;

  constructor(ttlMs: number = 60000) {
    this.ttlMs = ttlMs;
  }

  private generateKey(input: string | object): string {
    const data = typeof input === "string" ? input : JSON.stringify(input);
    return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
  }

  async dedupe<T>(key: string | object, fn: () => Promise<T>): Promise<T> {
    const fingerprint = this.generateKey(key);

    if (this.pending.has(fingerprint)) {
      return this.pending.get(fingerprint) as Promise<T>;
    }

    const promise = fn().finally(() => {
      setTimeout(() => {
        this.pending.delete(fingerprint);
      }, 100);
    });

    this.pending.set(fingerprint, promise);
    return promise;
  }

  hasPending(key: string | object): boolean {
    const fingerprint = this.generateKey(key);
    return this.pending.has(fingerprint);
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  clear(): void {
    this.pending.clear();
  }
}

export const llmRequestDeduplicator = new RequestDeduplicator();
