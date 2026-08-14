import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { SomodFinancialService } from './somod-financial.service';

export class UpsertFinancialModelDto {
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() monthly_guard_cost?: number;
  @IsOptional() @IsNumber() monthlyGuardCost?: number;
  @IsOptional() @IsNumber() monthly_supervisor_cost?: number;
  @IsOptional() @IsNumber() monthlySupervisorCost?: number;
  @IsOptional() @IsNumber() days_per_month?: number;
  @IsOptional() @IsNumber() daysPerMonth?: number;
  @IsOptional() @IsNumber() shift_hours?: number;
  @IsOptional() @IsNumber() shiftHours?: number;
  @IsOptional() @IsNumber() response_delay_cost_rate?: number;
  @IsOptional() @IsNumber() responseDelayCostRate?: number;
  @IsOptional() @IsNumber() default_incident_severity_multiplier?: number;
  @IsOptional() @IsNumber() defaultIncidentSeverityMultiplier?: number;
  @IsOptional() @IsNumber() monthly_contract_value?: number;
  @IsOptional() @IsNumber() monthlyContractValue?: number;
  @IsOptional() @IsNumber() patrol_value_per_miss?: number;
  @IsOptional() @IsNumber() patrolValuePerMiss?: number;
  @IsOptional() @IsNumber() technology_capex_total?: number;
  @IsOptional() @IsNumber() technologyCapexTotal?: number;
  @IsOptional() @IsNumber() technology_monthly_opex?: number;
  @IsOptional() @IsNumber() technologyMonthlyOpex?: number;
  @IsOptional() @IsNumber() technology_lifespan_months?: number | null;
  @IsOptional() @IsNumber() technologyLifespanMonths?: number | null;
}

export class PenaltyDto {
  @IsOptional() @IsString() penaltyKey?: string;
  @IsOptional() @IsString() penalty_id?: string;
  @IsOptional() @IsString() penaltyName?: string;
  @IsOptional() @IsString() penalty_name?: string;
  @IsOptional() @IsString() metricName?: string;
  @IsOptional() @IsString() metric_name?: string;
  @IsOptional() @IsString() thresholdType?: string;
  @IsOptional() @IsString() threshold_type?: string;
  @IsOptional() @IsNumber() thresholdValue?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() formulaExpression?: string;
  @IsOptional() @IsString() formula_expression?: string;
  @IsOptional() @IsString() appliesToControlId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class MappingDto {
  @IsOptional() @IsString() controlId?: string;
  @IsOptional() @IsString() control_id?: string;
  @IsOptional() @IsBoolean() financialRelevance?: boolean;
  @IsOptional() @IsBoolean() financial_relevance?: boolean;
  @IsOptional() @IsString() costCategory?: string;
  @IsOptional() @IsString() eventUnit?: string;
  @IsOptional() @IsString() exposureFormula?: string;
  @IsOptional() @IsString() recoverableFormula?: string;
  @IsOptional() @IsString() cfoOutputCategory?: string;
  @IsOptional() @IsString() penaltyId?: string;
}

export class FinancialReturnDto {
  @IsString() @MinLength(2) comment!: string;
}

export class FinancialReopenDto {
  @IsString() @MinLength(2) reason!: string;
}

/**
 * Handoff §7 REST surface — paths match the pack exactly:
 * /somod/{id}/financial-model, /penalties, /calculate-financials, etc.
 */
@Controller('somod')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SomodFinancialController {
  constructor(private readonly financial: SomodFinancialService) {}

  @Get(':id/financial-model')
  getModel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.financial.getFinancialModel(id, user);
  }

  @Post(':id/financial-model')
  createModel(
    @Param('id') id: string,
    @Body() body: UpsertFinancialModelDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.financial.upsertFinancialModel(id, body as Record<string, unknown>, user);
  }

  @Patch(':id/financial-model')
  patchModel(
    @Param('id') id: string,
    @Body() body: UpsertFinancialModelDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.financial.upsertFinancialModel(id, body as Record<string, unknown>, user);
  }

  @Get(':id/penalties')
  listPenalties(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.financial.listPenalties(id, user);
  }

  @Post(':id/penalties')
  createPenalty(
    @Param('id') id: string,
    @Body() body: PenaltyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.financial.createPenalty(id, body as Record<string, unknown>, user);
  }

  @Patch(':id/penalties/:penaltyId')
  updatePenalty(
    @Param('id') id: string,
    @Param('penaltyId') penaltyId: string,
    @Body() body: PenaltyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.financial.updatePenalty(id, penaltyId, body as Record<string, unknown>, user);
  }

  @Get(':id/control-financial-mappings')
  listMappings(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.financial.listMappings(id, user);
  }

  @Post(':id/control-financial-mappings')
  createMapping(
    @Param('id') id: string,
    @Body() body: MappingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.financial.createMapping(id, body as Record<string, unknown>, user);
  }

  @Patch(':id/control-financial-mappings/:mappingId')
  updateMapping(
    @Param('id') id: string,
    @Param('mappingId') mappingId: string,
    @Body() body: MappingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.financial.updateMapping(id, mappingId, body as Record<string, unknown>, user);
  }

  @Post(':id/calculate-financials')
  calculate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.financial.calculateFinancials(id, user);
  }

  @Get(':id/scenario-financials')
  scenarioFinancials(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.financial.getScenarioFinancials(id, user);
  }

  @Get(':id/cfo-dashboard')
  cfoDashboard(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.financial.getCfoDashboard(id, user);
  }

  @Get(':id/methodology')
  methodology(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.financial.getMethodology(id, user);
  }

  @Get(':id/engines/readiness')
  engineReadiness(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.financial.getEngineReadiness(id, user);
  }

  @Post(':id/financial-submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.financial.submitFinancialLayer(id, user);
  }

  @Post(':id/financial-approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.financial.approveFinancialLayer(id, user);
  }

  @Post(':id/financial-return')
  returnLayer(
    @Param('id') id: string,
    @Body() body: FinancialReturnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.financial.returnFinancialLayer(id, body.comment, user);
  }

  @Post(':id/financial-reopen')
  reopen(
    @Param('id') id: string,
    @Body() body: FinancialReopenDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.financial.reopenFinancialLayer(id, body.reason, user);
  }
}
