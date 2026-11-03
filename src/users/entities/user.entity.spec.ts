import { Mongoose } from 'mongoose';
import { User, UserSchema } from './user.entity';

const UserModel = new Mongoose().model(User.name, UserSchema);

const user = (fields: Record<string, unknown> = {}) =>
  new UserModel({
    googleId: 'google-123',
    email: 'jane@example.com',
    ...fields,
  });

describe('UserSchema', () => {
  it('defaults locale to null', () => {
    expect(user().locale).toBeNull();
  });

  it.each(['es', 'en', null])('accepts locale %p', (locale) => {
    expect(user({ locale }).validateSync()).toBeUndefined();
  });

  it('rejects an unknown locale', () => {
    const error = user({ locale: 'fr' }).validateSync();

    expect(Object.keys(error?.errors ?? {})).toEqual(['locale']);
  });
});
