export const MOBILE_PAGE_SCRIPT_CRYPTO_NETWORK = `      async function postJson(url, payload) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(text || ('Request failed (' + response.status + ')'));
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return response.json();
        }
        return null;
      }

      async function bootstrapPairing(otpCode, token) {
        return postJson('/api/pair/' + pairingId + '/bootstrap', { token, otp: otpCode });
      }

      async function submitAnswer(payload) {
        await postJson('/api/pair/' + pairingId + '/answer', payload);
      }

      async function requestChallengeResponse(challenge, token) {
        const response = await postJson('/api/pair/' + pairingId + '/challenge', { token, challenge });
        if (!response || typeof response.response !== 'string' || response.response.length === 0) {
          throw new Error(ui.connectionFailed);
        }
        return response.response;
      }

`;
