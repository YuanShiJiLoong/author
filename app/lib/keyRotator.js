// app/lib/keyRotator.js
const keyIndices = new Map();

/**
 * Parses a string of API keys (separated by commas, semicolons, newlines, or spaces)
 * and returns the next key in a round-robin fashion.
 * @param {string} rawKeyString - The original string potentially containing multiple keys.
 * @returns {string} A single API key to be used for the request.
 */
export function rotateKey(rawKeyString) {
    if (!rawKeyString || typeof rawKeyString !== 'string') {
        return rawKeyString;
    }
    
    // Split by commas, semicolons, spaces, newlines, and filter out empty strings
    const keys = rawKeyString.split(/[\s,;，；\n]+/).filter(k => k.trim().length > 0);
    
    // If empty or only one key, return as is
    if (keys.length === 0) return rawKeyString;
    if (keys.length === 1) return keys[0];

    // Create a unique identifier for this set of keys to track its round-robin index
    // Using the raw string itself or joined keys works well.
    const mapKey = keys.join('|');
    
    let currentIndex = keyIndices.get(mapKey) || 0;
    
    const selectedKey = keys[currentIndex];
    
    // Increment index and wrap around
    keyIndices.set(mapKey, (currentIndex + 1) % keys.length);
    
    return selectedKey;
}
