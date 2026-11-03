import { Request } from 'express';
import { UserDto } from '../../users/dtos/user.dto';

export class AuthResponseDto {
  accessToken: string;
  user: UserDto;
}

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
