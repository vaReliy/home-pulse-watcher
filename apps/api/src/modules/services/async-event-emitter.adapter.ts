import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IEventEmitter } from '@home-pulse-watcher/application';

/**
 * Adapter that wraps EventEmitter2.emitAsync() to implement IEventEmitter.
 * Ensures async event handlers complete before the caller continues.
 */
export class AsyncEventEmitterAdapter implements IEventEmitter {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emit(event: string, payload: unknown): Promise<boolean[]> {
    return this.eventEmitter.emitAsync(event, payload);
  }
}
