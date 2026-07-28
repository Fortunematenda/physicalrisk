import { IsIn, IsOptional } from 'class-validator';

export class ClearQueueDto {
  @IsOptional()
  @IsIn(['drafts', 'external', 'all', 'failed', 'imported', 'metrics'])
  scope?: 'drafts' | 'external' | 'all' | 'failed' | 'imported' | 'metrics';
}
