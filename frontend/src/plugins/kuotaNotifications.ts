import { registerPlugin } from '@capacitor/core';

export interface KuotaNotificationsPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  openSettings(): Promise<void>;
  addListener(
    event: 'notificationCaptured',
    handler: (data: { appPackage: string; title: string; text: string; amountCents: number }) => void
  ): Promise<{ remove: () => void }>;
}

export const KuotaNotifications = registerPlugin<KuotaNotificationsPlugin>('KuotaNotifications', {
  web: {
    checkPermission: async () => ({ granted: false }),
    openSettings: async () => {},
    addListener: async () => ({ remove: () => {} })
  }
});
