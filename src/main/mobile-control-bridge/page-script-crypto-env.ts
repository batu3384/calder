export const MOBILE_PAGE_SCRIPT_CRYPTO_ENV = `      function resolvePairingTokenFromUrl() {
        const url = new URL(window.location.href);
        const queryToken = url.searchParams.get('t');
        if (queryToken) return queryToken;
        const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
        if (!hash) return '';
        const hashParams = new URLSearchParams(hash);
        return hashParams.get('t') || '';
      }

      function resolveNativeBootstrapHint(tokenFromUrl) {
        const scope = window;
        const hint = scope && scope.__CALDER_NATIVE_BOOTSTRAP;
        if (!hint || typeof hint !== 'object') return null;
        if (hint.pairingId && hint.pairingId !== pairingId) return null;
        if (typeof hint.token !== 'string' || hint.token.length === 0) return null;
        if (hint.token !== tokenFromUrl) return null;
        if (!hint.payload || typeof hint.payload !== 'object') return null;
        return {
          token: hint.token,
          payload: hint.payload,
        };
      }

      function waitForIceGathering(pc) {
        return new Promise((resolve) => {
          if (pc.iceGatheringState === 'complete') {
            resolve();
            return;
          }
          const listener = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', listener);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', listener);
          setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', listener);
            resolve();
          }, 10000);
        });
      }

`;
