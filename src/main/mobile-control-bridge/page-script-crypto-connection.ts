export const MOBILE_PAGE_SCRIPT_CRYPTO_CONNECTION = `      async function encodeConnectionCode(desc, phrase) {
        return encryptPayload(JSON.stringify(desc), phrase);
      }

      async function decodeConnectionCode(code, expectedType, phrase) {
        const decoded = await decryptPayload(code, phrase);
        let parsed;
        try {
          parsed = JSON.parse(decoded);
        } catch {
          throw new Error(ui.malformedConnectionPayload);
        }
        const envelope = parsed && typeof parsed === 'object' && parsed.v === 2 && parsed.description
          ? parsed.description
          : parsed;
        if (!envelope || typeof envelope !== 'object' || typeof envelope.type !== 'string' || typeof envelope.sdp !== 'string') {
          throw new Error(ui.missingConnectionFields);
        }
        if (expectedType && envelope.type !== expectedType) {
          throw new Error(ui.connectionTypeMismatch);
        }
        return envelope;
      }

      async function computeChallengeResponse(challengeHex, phrase) {
        const challenge = hexToBytes(challengeHex);
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(normalizePassphrase(phrase)),
          'PBKDF2',
          false,
          ['deriveKey']
        );
        const hmacKey = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: CHALLENGE_SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
          keyMaterial,
          { name: 'HMAC', hash: 'SHA-256', length: 256 },
          false,
          ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', hmacKey, challenge);
        return bytesToHex(new Uint8Array(signature));
      }

`;
