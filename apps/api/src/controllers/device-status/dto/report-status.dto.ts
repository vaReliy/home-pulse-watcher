import { IsInt, IsOptional, Min, Max } from 'class-validator';

/**
 * DTO for device power status report.
 * Status values: 0 = OFF, 1 = ON
 * Voltage: optional ADC reading 0-4095 for diagnostics
 */
export class ReportStatusDto {
  @IsInt()
  @Min(0)
  @Max(1)
  status!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4095)
  voltage?: number;
}
