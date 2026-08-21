'use client';

const listeners = new Set();
const pendingOperations = new Map();
const SERVER_SNAPSHOT = Object.freeze({
    status: 'saved',
    pending: 0,
    error: null,
    lastSavedAt: null,
});

let nextOperationId = 1;
let lastError = null;
let lastSavedAt = null;
let snapshot = SERVER_SNAPSHOT;

function errorMessage(error) {
    const message = String(error?.message || error || '').trim();
    return message || 'Local save failed';
}

function publish() {
    snapshot = Object.freeze({
        status: lastError ? 'error' : pendingOperations.size > 0 ? 'saving' : 'saved',
        pending: pendingOperations.size,
        error: lastError,
        lastSavedAt,
    });
    for (const listener of listeners) listener();
}

export function subscribeLocalSaveStatus(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getLocalSaveSnapshot() {
    return snapshot;
}

export function getLocalSaveServerSnapshot() {
    return SERVER_SNAPSHOT;
}

export function beginLocalSave(label = 'local-write') {
    const operationId = nextOperationId++;
    pendingOperations.set(operationId, label);
    // A new write is the retry path after an error. It becomes saved only if
    // every pending local write completes successfully.
    lastError = null;
    publish();
    return operationId;
}

export function completeLocalSave(operationId) {
    if (!pendingOperations.delete(operationId)) return;
    if (pendingOperations.size === 0 && !lastError) {
        lastSavedAt = Date.now();
    }
    publish();
}

export function failLocalSave(operationId, error) {
    pendingOperations.delete(operationId);
    lastError = errorMessage(error);
    publish();
}

export async function trackLocalSave(operation, label) {
    const operationId = beginLocalSave(label);
    try {
        const result = await operation();
        completeLocalSave(operationId);
        return result;
    } catch (error) {
        failLocalSave(operationId, error);
        throw error;
    }
}

export function hasBlockingLocalSave() {
    return snapshot.pending > 0 || snapshot.status === 'error';
}

export function waitForLocalSaves({ timeoutMs = 5000 } = {}) {
    if (snapshot.status === 'error') {
        return Promise.reject(new Error(snapshot.error || 'Local save failed'));
    }
    if (snapshot.pending === 0) return Promise.resolve(snapshot);

    return new Promise((resolve, reject) => {
        let timeoutId = null;
        const unsubscribe = subscribeLocalSaveStatus(() => {
            if (snapshot.status === 'error') {
                if (timeoutId) clearTimeout(timeoutId);
                unsubscribe();
                reject(new Error(snapshot.error || 'Local save failed'));
            } else if (snapshot.pending === 0) {
                if (timeoutId) clearTimeout(timeoutId);
                unsubscribe();
                resolve(snapshot);
            }
        });

        timeoutId = setTimeout(() => {
            unsubscribe();
            reject(new Error('Timed out while waiting for local saves'));
        }, timeoutMs);
    });
}

export function resetLocalSaveStatusForTests() {
    pendingOperations.clear();
    lastError = null;
    lastSavedAt = null;
    nextOperationId = 1;
    publish();
}
