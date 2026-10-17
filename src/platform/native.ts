import { Capacitor } from "@capacitor/core";
/** 同梱版ではネットワーク上のPWA更新を使わず、ストアのアプリ更新を使う。 */
export const isNativeApp = Capacitor.isNativePlatform();
