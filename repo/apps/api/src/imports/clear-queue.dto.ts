import { IsIn, IsOptional } from 'class-validator';

export class ClearQueueDto {
  @IsOptional()
  @IsIn(['drafts', 'external', 'all'])
  scope?: 'drafts' | 'external' | 'all';
}
