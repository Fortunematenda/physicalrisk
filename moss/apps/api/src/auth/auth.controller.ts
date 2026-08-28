import { Body, Controller, Get, Headers, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthSessionService, SessionEventType } from './auth-session.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles';
import { RolesGuard } from '../common/roles.guard';

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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: AuthSessionService,
  ) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('session-event')
  sessionEvent(
    @Body() body: SessionEventDto,
    @Headers('x-auth-event-secret') secret: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    this.sessions.assertEventSecret(secret);
    return this.sessions.handleSessionEvent(body, {
      ipAddress: ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim(),
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('online-users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'AUDITOR')
  onlineUsers() {
    return this.sessions.listOnlineUsers();
  }
}
