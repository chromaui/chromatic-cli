import { createHash } from 'crypto';

// Inspired by https://en.gravatar.com/site/implement/hash
export function emailHash(email: string) {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}
