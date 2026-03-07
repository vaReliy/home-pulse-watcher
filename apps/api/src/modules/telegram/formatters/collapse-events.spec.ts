import { PowerStatus } from '@home-pulse-watcher/core';
import { PowerEvent } from '@home-pulse-watcher/core';
import { collapseEvents } from './collapse-events.js';

function makeEvent(
  status: PowerStatus,
  timestamp: string,
  duration: number | null = null,
): PowerEvent {
  return new PowerEvent({
    id: crypto.randomUUID(),
    deviceId: 'd1',
    status,
    timestamp: new Date(timestamp),
    duration,
    voltage: null,
  });
}

describe('collapseEvents', () => {
  it('should return empty array for empty input', () => {
    expect(collapseEvents([])).toEqual([]);
  });

  it('should return single entry for a single event', () => {
    const events = [makeEvent(PowerStatus.OFF, '2026-02-10T08:00:00Z', 300)];
    const result = collapseEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      status: PowerStatus.OFF,
      timestamp: new Date('2026-02-10T08:00:00Z'),
      duration: 300,
      eventCount: 1,
    });
  });

  it('should collapse consecutive same-status events', () => {
    const events = [
      makeEvent(PowerStatus.OFF, '2026-02-10T08:00:00Z', 300),
      makeEvent(PowerStatus.OFF, '2026-02-10T08:05:00Z', 300),
      makeEvent(PowerStatus.OFF, '2026-02-10T08:10:00Z', 300),
    ];
    const result = collapseEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      status: PowerStatus.OFF,
      timestamp: new Date('2026-02-10T08:00:00Z'),
      duration: 900,
      eventCount: 3,
    });
  });

  it('should not collapse events with different statuses', () => {
    const events = [
      makeEvent(PowerStatus.OFF, '2026-02-10T08:00:00Z', 300),
      makeEvent(PowerStatus.ON, '2026-02-10T08:05:00Z', 7200),
      makeEvent(PowerStatus.OFF, '2026-02-10T10:05:00Z', 600),
    ];
    const result = collapseEvents(events);

    expect(result).toHaveLength(3);
    expect(result[0].status).toBe(PowerStatus.OFF);
    expect(result[1].status).toBe(PowerStatus.ON);
    expect(result[2].status).toBe(PowerStatus.OFF);
  });

  it('should sum durations within a run', () => {
    const events = [
      makeEvent(PowerStatus.OFF, '2026-02-10T08:00:00Z', 300),
      makeEvent(PowerStatus.OFF, '2026-02-10T08:05:00Z', 300),
      makeEvent(PowerStatus.ON, '2026-02-10T08:10:00Z', 3600),
      makeEvent(PowerStatus.ON, '2026-02-10T09:10:00Z', 3600),
    ];
    const result = collapseEvents(events);

    expect(result).toHaveLength(2);
    expect(result[0].duration).toBe(600);
    expect(result[1].duration).toBe(7200);
  });

  it('should handle null durations — stay null when all are null', () => {
    const events = [
      makeEvent(PowerStatus.OFF, '2026-02-10T08:00:00Z', null),
      makeEvent(PowerStatus.OFF, '2026-02-10T08:05:00Z', null),
    ];
    const result = collapseEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0].duration).toBeNull();
    expect(result[0].eventCount).toBe(2);
  });

  it('should handle mixed null and non-null durations in a run', () => {
    const events = [
      makeEvent(PowerStatus.OFF, '2026-02-10T08:00:00Z', null),
      makeEvent(PowerStatus.OFF, '2026-02-10T08:05:00Z', 300),
      makeEvent(PowerStatus.OFF, '2026-02-10T08:10:00Z', null),
      makeEvent(PowerStatus.OFF, '2026-02-10T08:15:00Z', 300),
    ];
    const result = collapseEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0].duration).toBe(600);
    expect(result[0].eventCount).toBe(4);
  });

  it('should use the first event timestamp for each run', () => {
    const events = [
      makeEvent(PowerStatus.OFF, '2026-02-10T08:00:00Z', 300),
      makeEvent(PowerStatus.OFF, '2026-02-10T08:05:00Z', 300),
      makeEvent(PowerStatus.ON, '2026-02-10T08:10:00Z', 3600),
    ];
    const result = collapseEvents(events);

    expect(result[0].timestamp).toEqual(new Date('2026-02-10T08:00:00Z'));
    expect(result[1].timestamp).toEqual(new Date('2026-02-10T08:10:00Z'));
  });
});
