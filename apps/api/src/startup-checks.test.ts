import { describe, it, expect } from 'vitest';
import { findPlaceholderSecrets } from './startup-checks';

describe('findPlaceholderSecrets', () => {
  it('flags CHANGE_ME secrets only', () => {
    expect(
      findPlaceholderSecrets({
        WEB_IP_HASH_SALT: 'CHANGE_ME',
        ENCRYPTION_KEY: 'abc',
        NOTE: 'CHANGE_ME',
      } as NodeJS.ProcessEnv),
    ).toEqual(['WEB_IP_HASH_SALT']);
  });
});
