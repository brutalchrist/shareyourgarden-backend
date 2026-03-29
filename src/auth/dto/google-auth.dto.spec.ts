import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GoogleAuthDto } from './google-auth.dto';

describe('GoogleAuthDto', () => {
  it('validates a proper payload', async () => {
    const dto = plainToInstance(GoogleAuthDto, {
      code: 'auth-code',
      redirectUri: 'https://shareyourgarden.app',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when fields are missing or invalid', async () => {
    const dto = plainToInstance(GoogleAuthDto, {
      code: '',
      redirectUri: 'invalid',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
