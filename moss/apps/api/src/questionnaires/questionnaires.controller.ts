import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ValueType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QuestionnairesService } from './questionnaires.service';

class OptionDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MinLength(1) label!: string;
  @IsNumber() riskScore!: number;
  @IsOptional() @IsNumber() sortOrder?: number;
}

class QuestionDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) category!: string;
  @IsString() @MinLength(1) text!: string;
  @IsOptional() @IsString() guidance?: string;
  @IsOptional() @IsString() evidenceHint?: string;
  @IsNumber() weight!: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto)
  options?: OptionDto[];
}

class UpdateQuestionDto {
  @IsOptional() @IsString() @MinLength(1) code?: string;
  @IsOptional() @IsString() @MinLength(1) category?: string;
  @IsOptional() @IsString() @MinLength(1) text?: string;
  @IsOptional() @IsString() guidance?: string;
  @IsOptional() @IsString() evidenceHint?: string;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto)
  options?: OptionDto[];
}

class InputDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) label!: string;
  @IsOptional() @IsString() guidance?: string;
  @IsEnum(ValueType) valueType!: ValueType;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @Allow() defaultValue?: unknown;
}

class UpdateInputDto {
  @IsOptional() @IsString() @MinLength(1) code?: string;
  @IsOptional() @IsString() @MinLength(1) label?: string;
  @IsOptional() @IsString() guidance?: string;
  @IsOptional() @IsEnum(ValueType) valueType?: ValueType;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @Allow() defaultValue?: unknown;
}

@Controller('questionnaires')
@UseGuards(JwtAuthGuard)
export class QuestionnairesController {
  constructor(private readonly service: QuestionnairesService) {}

  @Get()
  list() {
    return this.service.listPublished();
  }

  @Get(':code')
  get(@Param('code') code: string) {
    return this.service.getPublished(code);
  }

  @Post('versions/:versionId/inputs')
  createInput(@Param('versionId') versionId: string, @Body() body: InputDto) {
    return this.service.createInput(versionId, body);
  }

  @Patch('inputs/:id')
  updateInput(@Param('id') id: string, @Body() body: UpdateInputDto) {
    return this.service.updateInput(id, body);
  }

  @Delete('inputs/:id')
  deleteInput(@Param('id') id: string) {
    return this.service.deleteInput(id);
  }

  @Post('versions/:versionId/questions')
  createQuestion(@Param('versionId') versionId: string, @Body() body: QuestionDto) {
    return this.service.createQuestion(versionId, body);
  }

  @Patch('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() body: UpdateQuestionDto) {
    return this.service.updateQuestion(id, body);
  }

  @Delete('questions/:id')
  deleteQuestion(@Param('id') id: string) {
    return this.service.deleteQuestion(id);
  }

  @Patch('assumptions/:id')
  updateAssumption(@Param('id') id: string, @Body() body: any) {
    return this.service.updateAssumption(id, body);
  }
}
