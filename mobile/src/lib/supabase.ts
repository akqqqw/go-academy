import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

import { getSupabaseConfig } from '@/lib/config'

// SecureStore ограничивает размер одного значения (2048 байт на iOS), а JWT
// с refresh-токеном туда не помещается. Поэтому хранилище режет значения на
// части и собирает их обратно — токены остаются в Keychain/Keystore.
const CHUNK_SIZE = 1800

const chunkKey = (key: string, index: number) => `${key}__part_${index}`

async function readChunks(key: string): Promise<string | null> {
  const first = await SecureStore.getItemAsync(chunkKey(key, 0))
  if (first === null) return null
  let value = first
  for (let index = 1; index < 32; index += 1) {
    const part = await SecureStore.getItemAsync(chunkKey(key, index))
    if (part === null) break
    value += part
  }
  return value
}

async function clearChunks(key: string): Promise<void> {
  for (let index = 0; index < 32; index += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, index))
  }
}

/** Адаптер хранилища для Supabase Auth: безопасное и не ограниченное по размеру. */
export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await readChunks(key)
    } catch {
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    await clearChunks(key)
    let index = 0
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      await SecureStore.setItemAsync(chunkKey(key, index), value.slice(offset, offset + CHUNK_SIZE))
      index += 1
    }
  },
  async removeItem(key: string): Promise<void> {
    await clearChunks(key)
  },
}

let client: SupabaseClient | null = null

/**
 * Клиент Supabase создаётся один раз после загрузки конфигурации.
 * Если параметров нет (их не задали ни в сборке, ни на сервере), клиент не
 * создаётся, а экран входа объясняет, что нужно заполнить.
 */
export function getSupabase(): SupabaseClient | null {
  if (client) return client
  const config = getSupabaseConfig()
  if (!config.url || !config.anonKey) return null
  client = createClient(config.url, config.anonKey, {
    auth: {
      storage: secureStorageAdapter,
      storageKey: 'goacademy.auth',
      autoRefreshToken: true,
      persistSession: true,
      // В React Native нет location/hash: глубокие ссылки обрабатывает Expo Router.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  })
  return client
}

export function isSupabaseConfigured(): boolean {
  const config = getSupabaseConfig()
  return Boolean(config.url && config.anonKey)
}
