// This is duplicated from https://github.com/chromaui/chromatic/blob/1ceabdd81936b883a2a9ddc804ed13bfa0919c47/services/index/model/lib/emailHash.ts#L1-L7
import { createHash } from 'crypto';

// Inspired by https://en.gravatar.com/site/implement/hash
export function emailHash(email: string) {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}
