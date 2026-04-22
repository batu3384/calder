import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { palette } from '../theme';
import { WEBVIEW_STATUS_BRIDGE } from './live-bridge';
import { styles } from './styles';
import type { MobileController } from './use-mobile-controller';

type MobileTabPanelProps = {
  controller: MobileController;
};

export function MobileTabPanel({ controller }: MobileTabPanelProps) {
  const { activeTab, copy, language } = controller;
  const liveControlUrl = controller.liveControlUrl;

  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>{copy.sectionTitle[activeTab]}</Text>
      <Text style={styles.sectionCopy}>{copy.sectionCopy[activeTab]}</Text>

      {activeTab === 'sessions' ? (
        <View style={styles.liveActionBlock}>
          <Text style={styles.liveFieldLabel}>{copy.liveSessionLabel}</Text>
          {controller.liveSessions.length > 0 ? (
            <View style={styles.sessionChipWrap}>
              {controller.liveSessions.map((session) => {
                const isSelected = session.id === controller.selectedLiveSessionId;
                return (
                  <Pressable
                    key={session.id}
                    style={[styles.sessionChip, isSelected ? styles.sessionChipActive : null]}
                    onPress={() => controller.setSelectedLiveSessionId(session.id)}
                  >
                    <Text style={[styles.sessionChipText, isSelected ? styles.sessionChipTextActive : null]}>
                      {session.name || session.id}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.inlineHint}>{copy.liveSessionEmpty}</Text>
          )}
          <Pressable
            style={styles.actionButton}
            onPress={() => controller.switchLiveSession(controller.selectedLiveSessionId)}
            disabled={controller.selectedLiveSessionId.trim().length === 0}
          >
            <Text style={styles.actionButtonText}>{copy.switchSessionButton}</Text>
          </Pressable>
          <Text style={styles.inlineHint}>{controller.liveSwitchNote || copy.switchSessionHint}</Text>
        </View>
      ) : null}

      {activeTab === 'cli' ? (
        <View style={styles.liveActionBlock}>
          <Text style={styles.liveFieldLabel}>{copy.commandLabel}</Text>
          <TextInput
            value={controller.commandDraft}
            onChangeText={controller.setCommandDraft}
            placeholder={copy.commandPlaceholder}
            placeholderTextColor={palette.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.actionButton} onPress={controller.sendCommandToLiveSession}>
            <Text style={styles.actionButtonText}>{copy.sendCommandButton}</Text>
          </Pressable>
          <Text style={styles.liveFieldLabel}>{copy.quickControlsLabel}</Text>
          <View style={styles.quickControlRow}>
            <Pressable style={styles.quickControlButton} onPress={() => controller.triggerQuickControl('ctrl-c')}>
              <Text style={styles.quickControlButtonText}>{copy.quickControlCtrlC}</Text>
            </Pressable>
            <Pressable style={styles.quickControlButton} onPress={() => controller.triggerQuickControl('ctrl-l')}>
              <Text style={styles.quickControlButtonText}>{copy.quickControlCtrlL}</Text>
            </Pressable>
            <Pressable style={styles.quickControlButton} onPress={() => controller.triggerQuickControl('enter')}>
              <Text style={styles.quickControlButtonText}>{copy.quickControlEnter}</Text>
            </Pressable>
            <Pressable style={styles.quickControlButton} onPress={() => controller.triggerQuickControl('tab')}>
              <Text style={styles.quickControlButtonText}>{copy.quickControlTab}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {activeTab === 'browser' ? (
        <View style={styles.liveActionBlock}>
          <Text style={styles.liveFieldLabel}>{copy.browserSessionLabel}</Text>
          {controller.liveBrowserSessions.length > 0 ? (
            <View style={styles.sessionChipWrap}>
              {controller.liveBrowserSessions.map((session) => {
                const isSelected = session.id === controller.selectedBrowserSessionId;
                return (
                  <Pressable
                    key={session.id}
                    style={[styles.sessionChip, isSelected ? styles.sessionChipActive : null]}
                    onPress={() => controller.switchBrowserSession(session.id)}
                  >
                    <Text style={[styles.sessionChipText, isSelected ? styles.sessionChipTextActive : null]}>
                      {session.name || session.id}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.inlineHint}>{copy.liveSessionEmpty}</Text>
          )}
          <Text style={styles.inlineHint}>{controller.browserStatusLine || copy.browserStatusWaiting}</Text>
          <Text style={styles.liveFieldLabel}>{copy.inspectSelectionLabel}</Text>
          <Text style={styles.inlineHint}>{controller.inspectSelectionLine || copy.inspectSelectionNone}</Text>
          <View style={styles.quickControlRow}>
            <Pressable style={styles.quickControlButton} onPress={() => controller.sendBrowserControl('back')}>
              <Text style={styles.quickControlButtonText}>{copy.browserBackButton}</Text>
            </Pressable>
            <Pressable style={styles.quickControlButton} onPress={() => controller.sendBrowserControl('forward')}>
              <Text style={styles.quickControlButtonText}>{copy.browserForwardButton}</Text>
            </Pressable>
            <Pressable style={styles.quickControlButton} onPress={() => controller.sendBrowserControl('reload')}>
              <Text style={styles.quickControlButtonText}>{copy.browserReloadButton}</Text>
            </Pressable>
            <Pressable style={styles.quickControlButton} onPress={() => controller.sendBrowserControl('toggle-inspect')}>
              <Text style={styles.quickControlButtonText}>{copy.browserInspectButton}</Text>
            </Pressable>
            <Pressable style={styles.quickControlButton} onPress={() => controller.sendBrowserViewport('Responsive')}>
              <Text style={styles.quickControlButtonText}>{copy.browserResponsiveButton}</Text>
            </Pressable>
            <Pressable style={styles.quickControlButton} onPress={() => controller.sendBrowserViewport('iPhone 14')}>
              <Text style={styles.quickControlButtonText}>{copy.browserPhoneButton}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {activeTab === 'inspect' ? (
        <View style={styles.liveActionBlock}>
          <Text style={styles.inlineHint}>{copy.inspectPhaseHint}</Text>
          <Pressable style={styles.actionButton} onPress={() => controller.sendBrowserControl('toggle-inspect')}>
            <Text style={styles.actionButtonText}>{copy.browserInspectButton}</Text>
          </Pressable>
          <Text style={styles.liveFieldLabel}>{copy.inspectSelectionLabel}</Text>
          <Text style={styles.inlineHint}>{controller.inspectSelectionLine || copy.inspectSelectionNone}</Text>
          <Text style={styles.liveFieldLabel}>{copy.inspectInstructionLabel}</Text>
          <TextInput
            value={controller.inspectInstructionDraft}
            onChangeText={controller.setInspectInstructionDraft}
            placeholder={copy.inspectInstructionPlaceholder}
            placeholderTextColor={palette.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.actionButton} onPress={controller.sendInspectPrompt}>
            <Text style={styles.actionButtonText}>{copy.inspectSendButton}</Text>
          </Pressable>
          <Text style={styles.inlineHint}>{controller.browserStatusLine || copy.browserStatusWaiting}</Text>
        </View>
      ) : null}

      {activeTab === 'live' && controller.liveControlVisible && liveControlUrl ? (
        <View style={styles.liveWrap}>
          <View style={styles.liveStatusGrid}>
            <View style={styles.liveStatusItem}>
              <Text style={styles.liveStatusLabel}>{copy.liveStatusLabel}</Text>
              <Text style={styles.liveStatusValue}>
                {controller.liveConsoleStatus || copy.liveConsoleWaiting}
              </Text>
            </View>
            <View style={styles.liveStatusItem}>
              <Text style={styles.liveStatusLabel}>{copy.liveConnectionLabel}</Text>
              <Text style={styles.liveStatusValue}>
                {controller.liveConnectionStatus || copy.liveConnectionWaiting}
              </Text>
            </View>
          </View>

          <View style={styles.webviewShell}>
            <WebView
              ref={controller.liveWebViewRef}
              source={{ uri: liveControlUrl }}
              style={styles.webview}
              onMessage={controller.onWebViewMessage}
              injectedJavaScriptBeforeContentLoaded={controller.bootstrapInjection}
              injectedJavaScript={WEBVIEW_STATUS_BRIDGE}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              onLoadStart={controller.handleLiveWebViewLoadStart}
              onError={controller.handleLiveWebViewError}
            />
          </View>
        </View>
      ) : activeTab === 'live' ? (
        <Text style={styles.inlineHint}>
          {language === 'tr'
            ? 'Canli sekmede kontrol gormek icin "Canli Kontrolu Ac" butonunu kullanin.'
            : 'Use "Open Live Control" to load the realtime control surface in Live tab.'}
        </Text>
      ) : null}
    </View>
  );
}
