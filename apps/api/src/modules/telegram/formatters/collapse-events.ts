import type { PowerEvent } from '@home-pulse-watcher/core';
import type { PowerStatus } from '@home-pulse-watcher/core';

/** A run of consecutive same-status events collapsed into one entry. */
export interface CollapsedEvent {
  /** Power status for this run. */
  status: PowerStatus;
  /** Timestamp of the first event in the run. */
  timestamp: Date;
  /** Sum of all durations in the run, or null if every event had null duration. */
  duration: number | null;
  /** How many raw events were collapsed into this entry. */
  eventCount: number;
}

/**
 * Collapse consecutive same-status events into single entries.
 * Events must be sorted by timestamp ascending.
 */
export function collapseEvents(events: PowerEvent[]): CollapsedEvent[] {
  if (events.length === 0) return [];

  const result: CollapsedEvent[] = [];
  let current: CollapsedEvent = {
    status: events[0].status,
    timestamp: events[0].timestamp,
    duration: events[0].duration,
    eventCount: 1,
  };

  for (let i = 1; i < events.length; i++) {
    const event = events[i];

    if (event.status === current.status) {
      current.eventCount++;
      if (event.duration !== null) {
        current.duration = (current.duration ?? 0) + event.duration;
      }
    } else {
      result.push(current);
      current = {
        status: event.status,
        timestamp: event.timestamp,
        duration: event.duration,
        eventCount: 1,
      };
    }
  }

  result.push(current);
  return result;
}
