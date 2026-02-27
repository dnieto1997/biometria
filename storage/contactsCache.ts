// storage/contactsCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const CONTACTS_KEY = "CONTACTS_CACHE";
const CONTACTS_LAST_SYNC = "CONTACTS_LAST_SYNC";

export async function saveContactsToCache(contacts: any[]) {
  if (!Array.isArray(contacts)) return;

  await AsyncStorage.setItem(
    CONTACTS_KEY,
    JSON.stringify(contacts)
  );

  await AsyncStorage.setItem(
    CONTACTS_LAST_SYNC,
    new Date().toISOString()
  );
}

export async function getContactsFromCache() {
  try {
    const data = await AsyncStorage.getItem(CONTACTS_KEY);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function shouldSyncContacts(maxAgeMs = 24 * 60 * 60 * 1000) {
  const lastSync = await AsyncStorage.getItem(CONTACTS_LAST_SYNC);
  if (!lastSync) return true;

  const diff = Date.now() - new Date(lastSync).getTime();
  return diff > maxAgeMs;
}
