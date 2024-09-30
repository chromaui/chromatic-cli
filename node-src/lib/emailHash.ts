import { createHash } from 'crypto';

/**
 * Create a hash of the provided email address.
 *
 * Inspired by https://en.gravatar.com/site/implement/hash
 *
 * @param email The plaintext email address.
 *
 * @returns A hashed version of the plaintext email address.
 */
export function emailHash(email: string) {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}
