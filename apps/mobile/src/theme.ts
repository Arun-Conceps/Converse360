// Tokens lifted from mobile-app-prototype.html (light mode only for v1).
export const colors = {
  bg: '#f1f4f2',
  surface: '#ffffff',
  surface2: '#eaf0ed',
  line: '#dbe3df',
  fg: '#12201a',
  muted: '#5d6f66',
  accent: '#0b7a5c',
  accentFg: '#ffffff',
  accentSoft: '#d9f0e7',
  out: '#d4f1e3',
  note: '#fbefc9',
  noteFg: '#6b4a00',
  warn: '#a15c00',
  warnSoft: '#fbead0',
  bad: '#b3261e',
  badSoft: '#f9dedc',
} as const;

export const radius = { sm: 8, md: 12, lg: 14, pill: 99 } as const;
// Spec §4: 44pt minimum touch targets.
export const HIT = 44;
