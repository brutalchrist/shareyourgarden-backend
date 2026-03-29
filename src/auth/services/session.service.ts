import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

export interface SessionUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

interface SessionRecord {
  id: string;
  user: SessionUser;
  csrfToken: string;
  expiresAt: number;
}

@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly ttlMs = Number.parseInt(
    process.env.SESSION_TTL_MS ?? '86400000',
    10,
  );

  createSession(user: SessionUser): SessionRecord {
    const id = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(16).toString('hex');
    const record: SessionRecord = {
      id,
      user,
      csrfToken,
      expiresAt: Date.now() + this.ttlMs,
    };

    this.sessions.set(id, record);
    return record;
  }

  getSession(id: string | undefined): SessionRecord | null {
    if (!id) {
      return null;
    }

    const current = this.sessions.get(id);
    if (!current) {
      return null;
    }

    if (current.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }

    return current;
  }

  invalidateSession(id: string | undefined): void {
    if (!id) {
      return;
    }

    this.sessions.delete(id);
  }
}
