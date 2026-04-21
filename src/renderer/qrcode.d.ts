declare module 'qrcode' {
  export interface QRCodeColorOptions {
    dark?: string;
    light?: string;
  }

  export interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    color?: QRCodeColorOptions;
  }

  export interface QRCodeModule {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  }

  const QRCode: QRCodeModule;
  export default QRCode;
}
