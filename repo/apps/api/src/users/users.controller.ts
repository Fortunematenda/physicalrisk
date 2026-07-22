import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../database/entities';
import { CurrentUser } from '../common/current-user.decorator';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() list() { return this.users.list(); }
  @Post() create(@Body() body: { name: string; email: string; password: string; role?: UserRole }, @CurrentUser() actor: { id?: string } | null) { return this.users.create(body, actor?.id); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: { name?: string; email?: string; password?: string; role?: UserRole; active?: boolean }, @CurrentUser() actor: { id?: string } | null) { return this.users.update(id, body, actor?.id); }
}
