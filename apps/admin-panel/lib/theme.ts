/**
 * Light/dark for the panel. The user's explicit choice, stored in the browser;
 * the OS setting is not consulted (light is the default). The sign-in page is
 * always light regardless — it uses fixed colours.
 */
export const MODES = ['light', 'dark'] as const;
export type Mode = (typeof MODES)[number];

export const MODE_STORAGE_KEY = 'converse360.admin.mode';
