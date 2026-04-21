export const MOBILE_PAGE_SCRIPT_CRYPTO_PRIMITIVES = `      function normalizePassphrase(value) {
        return value.trim().replace(/[\\s-]+/g, '').toUpperCase();
      }

      function hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
        }
        return bytes;
      }

      function bytesToHex(bytes) {
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      }

      function hasWebCryptoSupport() {
        const browserCrypto = globalThis.crypto;
        return Boolean(
          browserCrypto
          && typeof browserCrypto.getRandomValues === 'function'
          && browserCrypto.subtle
          && typeof browserCrypto.subtle.importKey === 'function'
        );
      }

      async function deriveAesKey(phrase, salt, usage) {
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(normalizePassphrase(phrase)),
          'PBKDF2',
          false,
          ['deriveKey']
        );
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          usage
        );
      }

      async function encryptPayload(plaintext, phrase) {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
        const key = await deriveAesKey(phrase, salt, ['encrypt']);
        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          new TextEncoder().encode(plaintext)
        );
        const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
        combined.set(salt, 0);
        combined.set(iv, SALT_LENGTH);
        combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);
        let binary = '';
        for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
        return btoa(binary);
      }

      async function decryptPayload(encoded, phrase) {
        let bytes;
        try {
          bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        } catch {
          throw new Error(ui.couldNotDecodeConnectionCode);
        }
        if (bytes.length < SALT_LENGTH + IV_LENGTH + 1) {
          throw new Error(ui.connectionCodeTooShort);
        }
        const salt = bytes.slice(0, SALT_LENGTH);
        const iv = bytes.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const ciphertext = bytes.slice(SALT_LENGTH + IV_LENGTH);
        try {
          const key = await deriveAesKey(phrase, salt, ['decrypt']);
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
          return new TextDecoder().decode(plain);
        } catch {
          throw new Error(ui.wrongPassphraseOrInvalidCode);
        }
      }

`;
