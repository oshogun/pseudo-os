// Saves the shell's state in IndexedDB. Earlier versions used localStorage,
// which is migrated on first load.

import type { SerializedShell } from "../shell/shell";

const DB_NAME = 'pseudo-os';
const STORE = 'state';
const KEY = 'shell';
const LEGACY_KEY = 'pseudo-os:v1';

function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transaction<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return open().then(db => new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
            db.close();
            resolve(request.result);
        };
        tx.onerror = tx.onabort = () => {
            db.close();
            reject(tx.error);
        };
    }));
}

function loadLegacy(): SerializedShell | undefined {
    try {
        const raw = localStorage.getItem(LEGACY_KEY);
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
}

// Returns the saved state, or undefined for a fresh install (or if storage is unavailable).
export async function loadState(): Promise<SerializedShell | undefined> {
    try {
        const saved = await transaction<SerializedShell | undefined>('readonly', store => store.get(KEY));
        if (saved) {
            return saved;
        }
    } catch {
        return loadLegacy();
    }
    const legacy = loadLegacy();
    if (legacy && await saveState(legacy)) {
        try {
            localStorage.removeItem(LEGACY_KEY);
        } catch {
            // Leaving the old copy behind is harmless.
        }
    }
    return legacy;
}

// Returns false if the state could not be saved.
export async function saveState(state: SerializedShell): Promise<boolean> {
    try {
        await transaction('readwrite', store => store.put(state, KEY));
        return true;
    } catch {
        return false;
    }
}
