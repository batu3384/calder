import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TAB_ORDER } from './src/app/copy';
import { statusColor } from './src/app/live-bridge';
import { MobileTabPanel } from './src/app/mobile-tab-panel';
import { styles } from './src/app/styles';
import { useMobileController } from './src/app/use-mobile-controller';
import { palette, spacing } from './src/theme';

export default function App() {
  const controller = useMobileController();
  const { copy } = controller;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>{copy.appTitle}</Text>
              <Text style={styles.subtitle}>{copy.appSubtitle}</Text>
            </View>
            <Pressable style={styles.languageButton} onPress={controller.toggleLanguage}>
              <Text style={styles.languageButtonText}>{copy.languageButton}</Text>
            </Pressable>
          </View>
          <View style={[styles.statusPill, { borderColor: statusColor(controller.connectionState) }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(controller.connectionState) }]} />
            <Text style={[styles.statusText, { color: statusColor(controller.connectionState) }]}>
              {controller.statusText}
            </Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>{copy.pairingLinkLabel}</Text>
          <TextInput
            value={controller.pairingLink}
            onChangeText={controller.setPairingLink}
            placeholder={copy.pairingLinkPlaceholder}
            placeholderTextColor={palette.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>{copy.otpLabel}</Text>
          <TextInput
            value={controller.otpCode}
            onChangeText={controller.setOtpCode}
            placeholder={copy.otpPlaceholder}
            placeholderTextColor={palette.textMuted}
            style={styles.input}
            keyboardType="number-pad"
            maxLength={6}
          />

          <View style={styles.primaryActions}>
            <Pressable
              style={[styles.connectButton, styles.flexAction]}
              disabled={controller.busy}
              onPress={() => {
                void controller.onConnect();
              }}
            >
              {controller.busy ? (
                <View style={styles.connectBusyWrap}>
                  <ActivityIndicator color={palette.bg} />
                  <Text style={styles.connectButtonText}>{copy.connectInProgress}</Text>
                </View>
              ) : (
                <Text style={styles.connectButtonText}>{copy.connectButton}</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.secondaryAction, styles.flexAction]}
              onPress={controller.toggleLiveControl}
            >
              <Text style={styles.secondaryActionText}>
                {controller.liveControlVisible ? copy.hideLiveControl : copy.openLiveControl}
              </Text>
            </Pressable>
          </View>

          {controller.message ? <Text style={styles.message}>{controller.message}</Text> : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRail}
        >
          {TAB_ORDER.map((tab) => {
            const active = tab === controller.activeTab;
            return (
              <Pressable
                key={tab}
                style={[styles.tabButton, active ? styles.tabButtonActive : null]}
                onPress={() => controller.setActiveTab(tab)}
              >
                <Text style={[styles.tabButtonText, active ? styles.tabButtonTextActive : null]}>
                  {copy.tabs[tab]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <MobileTabPanel controller={controller} />
      </ScrollView>
    </SafeAreaView>
  );
}
