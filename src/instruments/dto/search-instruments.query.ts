import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 50;

export class SearchInstrumentsQuery {
  /** Texto a buscar en ticker o nombre (coincidencia parcial). */
  @ApiProperty({ example: 'pamp', description: 'Ticker o nombre (parcial)' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  q: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MAX_SEARCH_LIMIT,
    default: DEFAULT_SEARCH_LIMIT,
    description: 'Cantidad máxima de resultados de la página',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SEARCH_LIMIT)
  limit: number = DEFAULT_SEARCH_LIMIT;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    default: 0,
    description: 'Cantidad de resultados a saltear',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
