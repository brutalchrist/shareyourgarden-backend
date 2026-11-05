import { IsBoolean, IsIn, IsOptional, ValidateIf } from 'class-validator';
import { LOCALES, type Locale } from '../users.constants';

export class UserDto {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  // null means "follow the browser/system language".
  locale: Locale | null;
  // When the welcome tour was finished or skipped; null if not seen yet.
  onboardingCompletedAt: Date | null;
}

export class UpdateUserDto {
  // @IsOptional also lets null through, which clears the preference.
  @IsOptional()
  @IsIn(LOCALES)
  locale?: Locale | null;

  // true marks the welcome tour as seen now (the server sets the date); false
  // clears it so the tour shows again. Unlike locale, null is rejected.
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  onboardingCompleted?: boolean;
}
