import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    if (
      this.config.get<string>('KEYCLOAK_ENABLED') === 'true' &&
      this.config.get<string>('ENABLE_LEGACY_LOGIN') !== 'true'
    ) {
      throw new ForbiddenException('Password login is disabled. Sign in with SSO via the portal.');
    }
    const user = await this.db.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user || !user.active || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
    return { accessToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  }
}
