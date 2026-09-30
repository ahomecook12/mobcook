import AsyncStorage from "@react-native-async-storage/async-storage";

const DEFAULT_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export const CACHE_KEYS = {
  homepage: "homepage",
  explore: "explore",
  reviews: "reviews",
  productDetail: "product-detail",
} as const;

type CacheEntry<T> = {
  value: T;
  savedAt: number;
};

export async function getCachedData<T>(
  key: string,
  ttl = DEFAULT_CACHE_TTL,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CacheEntry<T>;

    if (!parsed || typeof parsed.savedAt !== "number" || !("value" in parsed)) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    const age = Date.now() - parsed.savedAt;

    if (age >= ttl) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    return parsed.value;
  } catch (error) {
    console.error(`Cache read error (${key}):`, error);
    return null;
  }
}

export async function setCachedData<T>(key: string, value: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      value,
      savedAt: Date.now(),
    };

    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error(`Cache write error (${key}):`, error);
  }
}

export async function removeCachedData(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error(`Cache remove error (${key}):`, error);
  }
}

export async function clearAppCache(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();

    const appCacheKeys = allKeys.filter(
      (key) =>
        Object.values(CACHE_KEYS).some(
          (cacheKey) =>
            key === cacheKey ||
            key.startsWith(`${cacheKey}:`),
        ),
    );

    if (appCacheKeys.length > 0) {
      await AsyncStorage.multiRemove(
        appCacheKeys,
      );
    }
  } catch (error) {
    console.error(
      "App cache clear error:",
      error,
    );
    throw error;
  }
}
