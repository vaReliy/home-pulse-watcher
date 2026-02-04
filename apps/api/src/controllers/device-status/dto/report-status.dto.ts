import { IsInt, Min, Max } from 'class-validator';

/**
 * DTO for device power status report.
 * Status values: 0 = OFF, 1 = ON
 */
export class ReportStatusDto {
  @IsInt()
  @Min(0)
  @Max(1)
  status!: number;
}
