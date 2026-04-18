declare module 'react-native-webview' {
  import type { ForwardRefExoticComponent, RefAttributes } from 'react';
  import type { ViewProps } from 'react-native';

  export interface WebViewMessageEvent {
    nativeEvent: {
      data: string;
    };
  }

  export interface WebViewProps extends ViewProps {
    source?: { uri?: string };
    injectedJavaScriptBeforeContentLoaded?: string;
    injectedJavaScript?: string;
    onMessage?: (event: WebViewMessageEvent) => void;
    originWhitelist?: string[];
    javaScriptEnabled?: boolean;
    domStorageEnabled?: boolean;
    onLoadStart?: () => void;
    onError?: () => void;
  }

  export interface WebViewRef {
    injectJavaScript: (script: string) => void;
    reload: () => void;
  }

  export const WebView: ForwardRefExoticComponent<WebViewProps & RefAttributes<WebViewRef>>;
}
