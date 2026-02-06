import logger from "./logger";

export interface Destroyable {
  destroy(): void;
}

interface RegisteredService {
  name: string;
  instance: Destroyable;
  registeredAt: number;
}

class ServiceRegistry {
  private services: Map<string, RegisteredService> = new Map();

  register(name: string, instance: Destroyable): void {
    if (this.services.has(name)) {
      logger.warn("Service already registered, replacing", { name });
    }
    this.services.set(name, {
      name,
      instance,
      registeredAt: Date.now(),
    });
  }

  unregister(name: string): void {
    this.services.delete(name);
  }

  get(name: string): Destroyable | undefined {
    return this.services.get(name)?.instance;
  }

  destroyAll(): void {
    const entries = Array.from(this.services.entries());
    for (const [name, { instance }] of entries) {
      try {
        instance.destroy();
        logger.info(`Service destroyed: ${name}`);
      } catch (e) {
        logger.error(`Failed to destroy service: ${name}`, { error: e });
      }
    }
    this.services.clear();
  }

  getRegisteredNames(): string[] {
    return Array.from(this.services.keys());
  }

  getCount(): number {
    return this.services.size;
  }
}

export const serviceRegistry = new ServiceRegistry();
