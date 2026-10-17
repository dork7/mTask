import { describe, expect, it } from 'vitest';
import { getVapidKeys } from './config.ts';

/*
 * The VAPID keys of the environment (AC1): all three, trimmed, or nothing at all. A
 * server without them starts and cannot push, so a partial set is `undefined`, never an
 * error.
 */

/** The three names, each once. */
const NAMES = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;

/** All three set to a plain value. */
const SET: NodeJS.ProcessEnv = {
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
  VAPID_SUBJECT: 'mailto:a@b.c',
};

/** The three names with `name` left out, so a partial set shows. */
function without(name: (typeof NAMES)[number]): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...SET };
  delete env[name];
  return env;
}

describe('getVapidKeys (AC1)', () => {
  it('returns the three values, trimmed, when each is set with spaces around it', () => {
    expect(
      getVapidKeys({
        VAPID_PUBLIC_KEY: ' pub ',
        VAPID_PRIVATE_KEY: ' priv ',
        VAPID_SUBJECT: ' mailto:a@b.c ',
      }),
    ).toStrictEqual({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@b.c' });
  });

  it.each(NAMES)('is undefined when %s is left out and the others are set', (name) => {
    expect(getVapidKeys(without(name))).toBeUndefined();
  });

  it.each(NAMES.flatMap((name) => [
    [`${name} is empty`, name, ''],
    [`${name} is blank`, name, '   '],
  ] as const))('is undefined when %s', (_label, name, value) => {
    expect(getVapidKeys({ ...SET, [name]: value })).toBeUndefined();
  });

  it('is undefined when nothing is set, and never throws', () => {
    expect(getVapidKeys({})).toBeUndefined();
  });

  it('reads a full process.env-shaped object with all three, and never throws', () => {
    const full: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', HOME: '/home/dev', NODE_ENV: 'test', ...SET };

    expect(() => getVapidKeys(full)).not.toThrow();
    expect(getVapidKeys(full)).toStrictEqual({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@b.c' });
  });
});
