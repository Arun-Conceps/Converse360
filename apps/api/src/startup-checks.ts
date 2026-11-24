/**
 * Refuse to boot in production with a placeholder secret. Only env vars that
 * exist in this codebase are checked; extras are matched by name pattern.
 */
export function findPlaceholderSecrets(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return Object.entries(env)
    .filter(
      ([k, v]) =>
        typeof v === 'string' &&
        v.includes('CHANGE_ME') &&
        /(SECRET|SALT|KEY|PASSWORD|TOKEN)/i.test(k),
    )
    .map(([k]) => k);
}

