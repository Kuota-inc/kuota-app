import { Capacitor, registerPlugin } from '@capacitor/core';

interface IntegrityPlugin {
  checkRisk(): Promise<{ safe: boolean; risks: string }>;
}

const Integrity = registerPlugin<IntegrityPlugin>('KuotaIntegrity');
const native = Capacitor.isNativePlatform();

/** true = el dispositivo tiene overlay o accessibility services sospechosos activos. */
export async function deviceHasRisk(): Promise<{ safe: boolean; risks: string[] }> {
  if (!native) return { safe: true, risks: [] };
  try {
    const r = await Integrity.checkRisk();
    return { safe: r.safe, risks: r.risks ? r.risks.split(',') : [] };
  } catch {
    return { safe: true, risks: [] };
  }
}
