import { Injectable } from '@nestjs/common';

@Injectable()
export class CookieService {
  parseCookies(rawCookie: string | undefined): Record<string, string> {
    if (!rawCookie) {
      return {};
    }

    return rawCookie
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex <= 0) {
          return acc;
        }

        const key = decodeURIComponent(part.slice(0, separatorIndex));
        const value = decodeURIComponent(part.slice(separatorIndex + 1));
        acc[key] = value;
        return acc;
      }, {});
  }
}
