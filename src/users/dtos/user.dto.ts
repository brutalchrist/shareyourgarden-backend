import { IsIn, IsOptional } from 'class-validator';
import { LOCALES, type Locale } from '../users.constants';

export class UserDto {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  // null means "follow the browser/system language".
  locale: Locale | null;
}

export class UpdateUserDto {
  // @IsOptional also lets null through, which clears the preference.
  @IsOptional()
  @IsIn(LOCALES)
  locale?: Locale | null;
}
