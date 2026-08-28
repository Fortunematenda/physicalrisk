import { Body, Controller, Get, Headers, Ip, Post, Req, Request, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Request as ExpressRequest } from 'express';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UserRole } from '../database/entities';
import { AuthService } from './auth.service';
import { AuthSessionService, SessionEventType } from './auth-session.service';

class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}

class SessionEventDto {
  @IsIn(['SIGN_IN', 'SIGN_OUT', 'APP_LOGOUT'])
  event!: SessionEventType;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  app?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: AuthSessionService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() input: LoginDto) {
    return this.auth.login(input.email, input.password);
  }

  @Get('me')
  me(@Request() request: { user: unknown }) {
    return request.user;
  }

  @Public()
  @Post('session-event')
  sessionEvent(
    @Body() body: SessionEventDto,
    @Headers('x-auth-event-secret') secret: string | undefined,
    @Ip() ip: string,
    @Req() req: ExpressRequest,
  ) {
    this.sessions.assertEventSecret(secret);
    return this.sessions.handleSessionEvent(body, {
      ipAddress: ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim(),
    });
  }

  @Get('online-users')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  onlineUsers() {
    return this.sessions.listOnlineUsers();
  }
}
