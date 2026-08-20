export interface PhotoDeviceBudgetSnapshot {
  visibility: 'visible' | 'hidden';
  batteryLevel?: number;
  charging?: boolean;
  thermalState?: 'nominal' | 'fair' | 'serious' | 'critical';
}

export interface PhotoDeviceBudgetDecision extends PhotoDeviceBudgetSnapshot {
  allowed: boolean;
  pauseReason?: string;
}

export function evaluatePhotoDeviceBudget(snapshot: PhotoDeviceBudgetSnapshot): PhotoDeviceBudgetDecision {
  if (snapshot.visibility === 'hidden') return { ...snapshot, allowed: false, pauseReason: '应用已进入后台' };
  if (snapshot.thermalState === 'serious' || snapshot.thermalState === 'critical') {
    return { ...snapshot, allowed: false, pauseReason: `设备温控状态为 ${snapshot.thermalState}` };
  }
  if (snapshot.batteryLevel != null && snapshot.batteryLevel < 0.2 && snapshot.charging === false) {
    return { ...snapshot, allowed: false, pauseReason: `电量仅 ${Math.round(snapshot.batteryLevel * 100)}% 且未充电` };
  }
  return { ...snapshot, allowed: true };
}

interface BatteryLike { level: number; charging: boolean }
interface NavigatorWithBattery extends Navigator { getBattery?: () => Promise<BatteryLike> }

/** Best-effort WebView budget. Native thermal state can be added later without changing the pure policy. */
export async function getPhotoDeviceBudget(): Promise<PhotoDeviceBudgetDecision> {
  const visibility: PhotoDeviceBudgetSnapshot['visibility'] = typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 'hidden' : 'visible';
  let batteryLevel: number | undefined; let charging: boolean | undefined;
  try {
    const battery = await (typeof navigator === 'undefined' ? undefined : (navigator as NavigatorWithBattery).getBattery?.());
    batteryLevel = battery?.level; charging = battery?.charging;
  } catch { /* Battery Status API is optional in Android WebView and absent on iOS. */ }
  return evaluatePhotoDeviceBudget({ visibility, batteryLevel, charging });
}
