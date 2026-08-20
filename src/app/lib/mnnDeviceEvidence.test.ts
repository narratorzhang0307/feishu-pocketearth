import { describe, expect, it } from 'vitest';
import {
  MNN_CHECK_DEFINITIONS, armMnnRestart, createMnnEvidenceSuite, mnnSampleId,
  mnnSuiteMatches, setMnnCheck, type MnnFingerprint,
} from './mnnDeviceEvidence';

const fingerprint: MnnFingerprint = {
  device: 'device-1', android: '16', abi: 'arm64-v8a', appVersionName: '1.0', appVersionCode: 1,
  mnnVersion: '3.6.1', baseReleaseId: 'base-v1', baseManifestSha256: 'manifest-a',
  fixedTextInputSha256: 'text-a', fixedVisionInputSha256: 'vision-a',
};

describe('MNN device acceptance ledger', () => {
  it('creates all eleven checks as pending', () => {
    const suite = createMnnEvidenceSuite(fingerprint);
    expect(Object.keys(suite.checks)).toHaveLength(11);
    expect(MNN_CHECK_DEFINITIONS).toHaveLength(11);
    expect(Object.values(suite.checks).every((check) => check.state === 'pending')).toBe(true);
  });

  it('keeps deterministic sample ids so an interrupted run can resume without duplicates', () => {
    expect(mnnSampleId('suite', 'performance20', true, 0)).toBe('suite:performance20:warmup:0');
    expect(mnnSampleId('suite', 'performance20', false, 19)).toBe('suite:performance20:measured:19');
  });

  it('records restart as waiting until the Android process id changes', () => {
    const suite = armMnnRestart(createMnnEvidenceSuite(fingerprint), 'process-a');
    expect(suite.restartProcessInstanceId).toBe('process-a');
    expect(suite.checks.restartReload.state).toBe('waiting');
  });

  it('does not reuse a suite after an APK/model/input fingerprint changes', () => {
    const suite = createMnnEvidenceSuite(fingerprint);
    expect(mnnSuiteMatches(suite, fingerprint)).toBe(true);
    expect(mnnSuiteMatches(suite, { ...fingerprint, appVersionCode: 2 })).toBe(false);
    expect(mnnSuiteMatches(suite, { ...fingerprint, baseManifestSha256: 'manifest-b' })).toBe(false);
    expect(mnnSuiteMatches(suite, { ...fingerprint, fixedVisionInputSha256: 'vision-b' })).toBe(false);
  });

  it('never turns blocked offline evidence into a passed check', () => {
    const suite = setMnnCheck(createMnnEvidenceSuite(fingerprint), 'offlineVision', 'blocked', 'network online');
    expect(suite.checks.offlineVision.state).toBe('blocked');
    expect(suite.state).not.toBe('completed');
  });
});
