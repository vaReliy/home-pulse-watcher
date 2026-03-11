/**
 * DTO for device power status report.
 * Validation is handled by LIVR in ProcessPowerStatusService.
 * Status values: 0 = OFF, 1 = ON
 * Voltage: optional ADC reading 0-4095 for diagnostics
 * FirmwareVersion: optional semver string reported by device
 * BatteryVoltage: optional battery voltage in millivolts (UPS Edition V2.3+ only)
 */
export class ReportStatusDto {
  status!: number;
  voltage?: number;
  firmwareVersion?: string;
  batteryVoltage?: number;
}
