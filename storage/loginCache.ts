// storage/loginCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOGIN_CACHE_KEY = "LOGIN_CACHE";

export async function saveUserToCache(user: any) {
  const cache = JSON.parse(
    (await AsyncStorage.getItem(LOGIN_CACHE_KEY)) || "{}"
  );

  const cedula = String(user.nit); // 🔑 normalizamos

  cache[cedula] = {
    ...user,
    cedula,
  };

  await AsyncStorage.setItem(
    LOGIN_CACHE_KEY,
    JSON.stringify(cache)
  );
}

export async function getUserFromCache(cedula: string) {
  const raw = await AsyncStorage.getItem(LOGIN_CACHE_KEY);
  if (!raw) return null;

  const cache = JSON.parse(raw);
  return cache[String(cedula)] ?? null;
}
