// Privacy Boundary · 云端图片上传的单一许可判定。
// 只有用户针对明确用途主动确认后，业务层才能把 allowCloud 置为 true。
export interface CloudUploadConsent {
  confirmed: boolean;
  purpose: 'public-exhibit-label';
  confirmedAt: number;
}

export function cloudUploadAllowed(consent: CloudUploadConsent | null | undefined): boolean {
  return !!consent?.confirmed && consent.purpose === 'public-exhibit-label'
    && Number.isFinite(consent.confirmedAt) && consent.confirmedAt > 0;
}
