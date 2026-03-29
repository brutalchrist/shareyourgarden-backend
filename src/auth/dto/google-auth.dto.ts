import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false }, { message: 'redirectUri must be a valid URL' })
  redirectUri: string;
}
