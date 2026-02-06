import logger from "./logger";
import { serviceRegistry, type Destroyable } from "./service-registry";

interface EvictionConfig {
  maxSize: number;
  strategy: "lru" | "fifo";
}

export abstract class BaseService implements Destroyable {
  protected readonly serviceName: string;

  constructor(name: string) {
    this.serviceName = name;
    serviceRegistry.register(name, this);
    logger.info(`${name} initialized`);
  }

  abstract destroy(): void;

  protected log(message: string, meta?: Record<string, unknown>): void {
    logger.info(message, { service: this.serviceName, ...meta });
  }

  protected logError(message: string, meta?: Record<string, unknown>): void {
    logger.error(message, { service: this.serviceName, ...meta });
  }

  protected logWarn(message: string, meta?: Record<string, unknown>): void {
    logger.warn(message, { service: this.serviceName, ...meta });
  }

  protected createManagedMap<K, V>(config: EvictionConfig): ManagedMap<K, V> {
    return new ManagedMap<K, V>(config);
  }
}

export class ManagedMap<K, V> {
  private map: Map<K, V> = new Map();
  private accessOrder: K[] = [];
  private readonly config: EvictionConfig;

  constructor(config: EvictionConfig) {
    this.config = config;
  }

  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined && this.config.strategy === "lru") {
      this.touchKey(key);
    }
    return val;
  }

  set(key: K, value: V): void {
    if (!this.map.has(key)) {
      this.evictIfNeeded();
      this.accessOrder.push(key);
    } else if (this.config.strategy === "lru") {
      this.touchKey(key);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }

  values(): V[] {
    return Array.from(this.map.values());
  }

  keys(): K[] {
    return Array.from(this.map.keys());
  }

  entries(): [K, V][] {
    return Array.from(this.map.entries());
  }

  forEach(callback: (value: V, key: K) => void): void {
    this.map.forEach(callback);
  }

  clear(): void {
    this.map.clear();
    this.accessOrder = [];
  }

  private touchKey(key: K): void {
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);
  }

  private evictIfNeeded(): void {
    while (this.map.size >= this.config.maxSize && this.accessOrder.length > 0) {
      const evictKey = this.accessOrder.shift();
      if (evictKey !== undefined) {
        this.map.delete(evictKey);
      }
    }
  }
}
