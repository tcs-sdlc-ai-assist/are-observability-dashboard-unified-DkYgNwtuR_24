import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getItem,
  setItem,
  removeItem,
  isStorageAvailable,
  getNamespacedKey,
} from '../utils/storage';

/**
 * Custom hook for reactive localStorage state management.
 * Returns a [value, setValue] tuple with automatic JSON serialization/deserialization
 * and cross-tab synchronization via the `storage` event.
 *
 * @param {string} key - The storage key (will be namespaced with 'are_' prefix automatically).
 * @param {*} [initialValue=null] - The initial/default value if no stored value exists.
 * @returns {[*, Function, Function]} Tuple of [storedValue, setValue, removeValue].
 *   - storedValue: The current deserialized value from localStorage.
 *   - setValue: Function to update the stored value. Accepts a value or an updater function (prevValue => newValue).
 *   - removeValue: Function to remove the key from localStorage and reset to initialValue.
 */
const useLocalStorage = (key, initialValue = null) => {
  const keyRef = useRef(key);
  const initialValueRef = useRef(initialValue);

  // Keep refs in sync if key or initialValue changes
  keyRef.current = key;
  initialValueRef.current = initialValue;

  /**
   * Read the current value from localStorage, falling back to initialValue.
   * @returns {*} The stored value or the initial value.
   */
  const readStoredValue = useCallback(() => {
    if (!key || typeof key !== 'string') {
      return initialValue;
    }

    if (!isStorageAvailable()) {
      return initialValue;
    }

    return getItem(key, initialValue);
  }, [key, initialValue]);

  const [storedValue, setStoredValue] = useState(readStoredValue);

  /**
   * Update the value in both React state and localStorage.
   * Accepts either a direct value or an updater function (prevValue => newValue).
   * @param {*|Function} valueOrUpdater - The new value or an updater function.
   */
  const setValue = useCallback(
    (valueOrUpdater) => {
      if (!keyRef.current || typeof keyRef.current !== 'string') {
        return;
      }

      setStoredValue((prevValue) => {
        const newValue =
          typeof valueOrUpdater === 'function' ? valueOrUpdater(prevValue) : valueOrUpdater;

        setItem(keyRef.current, newValue);

        return newValue;
      });
    },
    [],
  );

  /**
   * Remove the key from localStorage and reset state to the initial value.
   */
  const removeValue = useCallback(() => {
    if (!keyRef.current || typeof keyRef.current !== 'string') {
      return;
    }

    removeItem(keyRef.current);
    setStoredValue(initialValueRef.current);
  }, []);

  // Re-read from storage when the key changes
  useEffect(() => {
    setStoredValue(readStoredValue());
  }, [readStoredValue]);

  // Cross-tab synchronization via the storage event
  useEffect(() => {
    if (!key || typeof key !== 'string') {
      return;
    }

    if (!isStorageAvailable()) {
      return;
    }

    const namespacedKey = getNamespacedKey(key);

    /**
     * Handle storage events fired by other tabs/windows.
     * Updates local state when the same key is modified externally.
     * @param {StorageEvent} event - The storage event.
     */
    const handleStorageChange = (event) => {
      if (!event || event.storageArea !== window.localStorage) {
        return;
      }

      if (event.key !== namespacedKey) {
        return;
      }

      // Key was removed
      if (event.newValue === null) {
        setStoredValue(initialValueRef.current);
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue);
        setStoredValue(parsed);
      } catch (_e) {
        // If parsing fails, use the raw string value
        setStoredValue(event.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key]);

  return [storedValue, setValue, removeValue];
};

export { useLocalStorage };
export default useLocalStorage;