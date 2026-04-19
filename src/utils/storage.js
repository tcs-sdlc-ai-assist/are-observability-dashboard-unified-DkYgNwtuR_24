const NAMESPACE_PREFIX = 'are_';

/**
 * Build a namespaced storage key.
 * @param {string} key - The base key name.
 * @returns {string} The namespaced key with 'are_' prefix.
 */
const getNamespacedKey = (key) => {
  if (!key || typeof key !== 'string') {
    return '';
  }

  return key.startsWith(NAMESPACE_PREFIX) ? key : `${NAMESPACE_PREFIX}${key}`;
};

/**
 * Check if localStorage is available and functional.
 * @returns {boolean} True if localStorage is available.
 */
const isStorageAvailable = () => {
  try {
    const testKey = `${NAMESPACE_PREFIX}__storage_test__`;
    window.localStorage.setItem(testKey, 'test');
    window.localStorage.removeItem(testKey);
    return true;
  } catch (_e) {
    return false;
  }
};

/**
 * Get the approximate storage usage in bytes for all namespaced keys.
 * @returns {{ used: number, keys: number }} Object with used bytes and key count.
 */
const getStorageUsage = () => {
  if (!isStorageAvailable()) {
    return { used: 0, keys: 0 };
  }

  let totalBytes = 0;
  let keyCount = 0;

  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(NAMESPACE_PREFIX)) {
        const value = window.localStorage.getItem(key);
        totalBytes += (key.length + (value ? value.length : 0)) * 2;
        keyCount++;
      }
    }
  } catch (_e) {
    // Silently handle iteration errors
  }

  return { used: totalBytes, keys: keyCount };
};

/**
 * Retrieve and deserialize a value from localStorage by key.
 * @param {string} key - The base key name (will be namespaced automatically).
 * @param {*} [defaultValue=null] - Default value to return if key is not found or on error.
 * @returns {*} The deserialized value or the default value.
 */
const getItem = (key, defaultValue = null) => {
  if (!key || typeof key !== 'string') {
    return defaultValue;
  }

  if (!isStorageAvailable()) {
    console.warn('[storage] localStorage is not available');
    return defaultValue;
  }

  const namespacedKey = getNamespacedKey(key);

  try {
    const raw = window.localStorage.getItem(namespacedKey);

    if (raw === null) {
      return defaultValue;
    }

    return JSON.parse(raw);
  } catch (e) {
    console.error(`[storage] Failed to read key "${namespacedKey}":`, e);
    return defaultValue;
  }
};

/**
 * Serialize and store a value in localStorage.
 * @param {string} key - The base key name (will be namespaced automatically).
 * @param {*} value - The value to serialize and store.
 * @returns {boolean} True if the value was stored successfully.
 */
const setItem = (key, value) => {
  if (!key || typeof key !== 'string') {
    console.error('[storage] Invalid key provided to setItem');
    return false;
  }

  if (!isStorageAvailable()) {
    console.warn('[storage] localStorage is not available');
    return false;
  }

  const namespacedKey = getNamespacedKey(key);

  try {
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(namespacedKey, serialized);
    return true;
  } catch (e) {
    if (e instanceof DOMException && (e.code === 22 || e.code === 1014 || e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      const usage = getStorageUsage();
      console.error(
        `[storage] Storage quota exceeded when writing key "${namespacedKey}". ` +
        `Current usage: ~${(usage.used / 1024).toFixed(1)} KB across ${usage.keys} keys.`,
      );
    } else {
      console.error(`[storage] Failed to write key "${namespacedKey}":`, e);
    }
    return false;
  }
};

/**
 * Remove a single item from localStorage by key.
 * @param {string} key - The base key name (will be namespaced automatically).
 * @returns {boolean} True if the removal was successful.
 */
const removeItem = (key) => {
  if (!key || typeof key !== 'string') {
    return false;
  }

  if (!isStorageAvailable()) {
    console.warn('[storage] localStorage is not available');
    return false;
  }

  const namespacedKey = getNamespacedKey(key);

  try {
    window.localStorage.removeItem(namespacedKey);
    return true;
  } catch (e) {
    console.error(`[storage] Failed to remove key "${namespacedKey}":`, e);
    return false;
  }
};

/**
 * Clear all namespaced ('are_' prefixed) items from localStorage.
 * Does not affect non-namespaced keys from other applications.
 * @returns {boolean} True if the clear operation was successful.
 */
const clear = () => {
  if (!isStorageAvailable()) {
    console.warn('[storage] localStorage is not available');
    return false;
  }

  try {
    const keysToRemove = [];

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(NAMESPACE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });

    return true;
  } catch (e) {
    console.error('[storage] Failed to clear namespaced storage:', e);
    return false;
  }
};

/**
 * Get all namespaced keys currently stored in localStorage.
 * @returns {string[]} Array of base key names (without the namespace prefix).
 */
const getKeys = () => {
  if (!isStorageAvailable()) {
    return [];
  }

  const keys = [];

  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(NAMESPACE_PREFIX)) {
        keys.push(key.slice(NAMESPACE_PREFIX.length));
      }
    }
  } catch (_e) {
    // Silently handle iteration errors
  }

  return keys;
};

/**
 * Check if a namespaced key exists in localStorage.
 * @param {string} key - The base key name (will be namespaced automatically).
 * @returns {boolean} True if the key exists.
 */
const hasItem = (key) => {
  if (!key || typeof key !== 'string') {
    return false;
  }

  if (!isStorageAvailable()) {
    return false;
  }

  const namespacedKey = getNamespacedKey(key);

  try {
    return window.localStorage.getItem(namespacedKey) !== null;
  } catch (_e) {
    return false;
  }
};

export {
  NAMESPACE_PREFIX,
  getNamespacedKey,
  isStorageAvailable,
  getStorageUsage,
  getItem,
  setItem,
  removeItem,
  clear,
  getKeys,
  hasItem,
};