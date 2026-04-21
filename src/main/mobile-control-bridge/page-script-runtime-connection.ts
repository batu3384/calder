export const MOBILE_PAGE_SCRIPT_RUNTIME_CONNECTION = `      function resolveBootstrapOfferDescription(payload) {
        const inlineOffer = payload && typeof payload.offerDescription === 'object'
          ? payload.offerDescription
          : null;
        if (
          inlineOffer
          && inlineOffer.type === 'offer'
          && typeof inlineOffer.sdp === 'string'
          && inlineOffer.sdp.trim().length > 0
        ) {
          return inlineOffer;
        }
        return null;
      }

      function normalizeConnectionDescription(value, expectedType) {
        if (!value || typeof value !== 'object') return null;
        if (value.type !== expectedType) return null;
        if (typeof value.sdp !== 'string' || value.sdp.trim().length === 0) return null;
        return { type: expectedType, sdp: value.sdp };
      }

      async function connectToHost(payload, token) {
        passphrase = payload.passphrase;
        currentMode = payload.mode === 'readwrite' ? 'readwrite' : 'readonly';
        modeBadge.textContent = ui.modePrefix + ': ' + (currentMode === 'readwrite' ? ui.modeReadwrite : ui.modeReadonly);

        const rtcConfig = {
          iceServers: Array.isArray(payload.iceServers) ? payload.iceServers : []
        };
        if (payload.iceTransportPolicy === 'relay') {
          rtcConfig.iceTransportPolicy = 'relay';
        }
        const pc = new RTCPeerConnection(rtcConfig);
        pc.oniceconnectionstatechange = function () {
          setConnState(pc.iceConnectionState);
        };
        pc.ondatachannel = function (event) {
          void attachDataChannel(event.channel);
        };

        const inlineOffer = resolveBootstrapOfferDescription(payload);
        if (!inlineOffer && !hasWebCryptoSupport()) {
          throw new Error(ui.wrongPassphraseOrInvalidCode);
        }
        const remoteDesc = inlineOffer || await decodeConnectionCode(payload.offer, 'offer', passphrase);
        await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGathering(pc);

        const answerDesc = normalizeConnectionDescription(pc.localDescription || answer, 'answer');
        if (!answerDesc) {
          throw new Error(ui.missingConnectionFields);
        }
        if (hasWebCryptoSupport()) {
          const answerCode = await encodeConnectionCode(answerDesc, passphrase);
          await submitAnswer({ token, submitToken: payload.submitToken, answer: answerCode });
        } else {
          await submitAnswer({ token, submitToken: payload.submitToken, answerDescription: answerDesc });
        }
        setStatus(ui.answerDelivered);
      }

`;
