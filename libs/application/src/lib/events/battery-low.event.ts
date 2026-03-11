/** Battery low threshold in millivolts — below this triggers a SOS alert.
 * Keep in sync with BATTERY_VOLTAGE_LOW_MV in firmware/esp32c3/src/config.h and firmware/esp32c6/src/config.h */
export const BATTERY_LOW_THRESHOLD_MV = 3400;

/** Event name constant for event emitter registration. */
export const BATTERY_LOW_EVENT = 'battery.low';

/**
 * Domain event emitted when a UPS device's battery drops below the low threshold.
 * Used to send SOS alerts during prolonged power outages.
 */
export class BatteryLowEvent {
  readonly deviceId: string;
  readonly deviceLabel: string | null;
  /** Battery voltage in millivolts at time of event. */
  readonly batteryVoltage: number;
  readonly timestamp: Date;

  constructor(props: {
    deviceId: string;
    deviceLabel: string | null;
    batteryVoltage: number;
    timestamp: Date;
  }) {
    this.deviceId = props.deviceId;
    this.deviceLabel = props.deviceLabel;
    this.batteryVoltage = props.batteryVoltage;
    this.timestamp = props.timestamp;
  }
}
