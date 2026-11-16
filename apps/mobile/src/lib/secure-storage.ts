import * as SecureStore from 'expo-secure-store';

// SecureStore refuses values over ~2 KB and a Supabase session is larger, so a
// value is split across numbered keys. Used as the Supabase auth `storage`.
const CHUNK = 1800;
const countKey = (k: string) => `${k}.n`;

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = Number(await SecureStore.getItemAsync(countKey(key)));
    if (!n) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await SecureStore.getItemAsync(`${key}.${i}`);
      if (p == null) return null; // torn write: treat as signed out
      parts.push(p);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    await secureStorage.removeItem(key);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(countKey(key), String(n));
  },
  async removeItem(key: string): Promise<void> {
    const n = Number(await SecureStore.getItemAsync(countKey(key)));
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(countKey(key));
  },
};
