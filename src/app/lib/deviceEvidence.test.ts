import { describe, expect, it } from 'vitest';
import {
  advanceFormalSuite, buildRuntimeFingerprint, createFormalEvidenceSuite, improvementPercent,
  formalOutputQualityGate, nextFormalLeg, normalizeEvidenceOutput, summarizeSamples, summarizeValues,
  validateFormalEnvironment, validateFormalSample,
  type DeviceBenchmarkSample, type FormalEvidenceSuite,
} from './deviceEvidence';
import type { EdgeResponse } from '../../../frost-agent/edge/types';

const inputSha256 = 'a'.repeat(64);

function runtime(sme2Effective = false, overrides: Partial<NonNullable<EdgeResponse['runtime']>> = {}): EdgeResponse['runtime'] {
  return {
    engine: 'mnn', nativeBridge: true, version: 'MNN-3.3.0+pocket-jni-v3', mnnEnabled: true,
    sme2Requested: sme2Effective, sme2Effective, cpuTarget: sme2Effective ? 3 : 2,
    device: {
      manufacturer: 'Alibaba', model: 'FinalPhone', device: 'final', android: '16', sdk: 36,
      abi: 'arm64-v8a', appVersionName: '1.0.0', appVersionCode: 1,
    },
    ...overrides,
  };
}

function nextValidSample(suite: FormalEvidenceSuite, temperature = 35): DeviceBenchmarkSample {
  const active = nextFormalLeg(suite);
  if (!active) throw new Error('suite_already_complete');
  const warmup = active.leg.warmupsCommitted < active.leg.warmupsTarget;
  const index = warmup ? active.leg.warmupsCommitted : active.leg.measuredCommitted;
  const now = new Date(Date.parse('2026-08-11T00:00:00.000Z') + suite.counts.total * 1000).toISOString();
  const sample: DeviceBenchmarkSample = {
    id: `sample-${suite.counts.total}`, suiteId: suite.id, pairId: active.pair.id,
    legIndex: active.leg.index, mode: active.leg.mode, inputSha256, index, warmup,
    startedAt: now, completedAt: now, ok: true, output: 'POCKET_MNN_READY',
    outputSha256: 'b'.repeat(64), normalizedOutputSha256: 'b'.repeat(64), qualityGatePassed: true,
    runtime: runtime(active.leg.mode === 'B'),
    stats: { elapsedMs: 100, thermalStatus: 0, batteryTemperatureC: temperature },
  };
  sample.invalidReason = validateFormalSample(suite, sample) || undefined;
  return sample;
}

describe('device benchmark evidence', () => {
  it('keeps raw sample statistics deterministic', () => {
    expect(summarizeValues([40, 10, 30, 20, 50])).toEqual({ count: 5, min: 10, p50: 30, p95: 50, max: 50, mean: 30 });
  });

  it('summarizes only numeric metrics', () => {
    const samples = [100, 120, 110].map((elapsedMs, index) => ({
      index, warmup: false, startedAt: '', completedAt: '', ok: true,
      stats: { elapsedMs, decodeTokensPerSecond: 10 + index },
    })) satisfies DeviceBenchmarkSample[];
    const summary = summarizeSamples(samples);
    expect(summary.elapsedMs.p50).toBe(110);
    expect(summary.decodeTokensPerSecond.mean).toBe(11);
    expect(summary.modelLoadMs).toBeUndefined();
  });

  it('reports lower latency and higher throughput improvements with correct direction', () => {
    const off = summarizeValues([100, 100, 100])!;
    const onLatency = summarizeValues([80, 80, 80])!;
    const onThroughput = summarizeValues([125, 125, 125])!;
    expect(improvementPercent(off, onLatency)).toBe(20);
    expect(improvementPercent(off, onThroughput, true)).toBe(25);
  });

  it('normalizes structured output before hashing and keeps a separate fixed-output quality gate', () => {
    expect(normalizeEvidenceOutput('{"b":2,"a":1}')).toBe('{"a":1,"b":2}');
    expect(formalOutputQualityGate('  POCKET_MNN_READY\n')).toBe(true);
    expect(formalOutputQualityGate('POCKET_MNN_NOT_READY')).toBe(false);
  });

  it('finishes the formal ABBA × 2 state machine with 20 measured samples per mode', () => {
    let suite = createFormalEvidenceSuite(buildRuntimeFingerprint(runtime(false), inputSha256), '2026-08-11T00:00:00.000Z');
    expect(suite.pairs.map((pair) => pair.legs.map((leg) => leg.mode))).toEqual([
      ['A', 'B', 'B', 'A'], ['A', 'B', 'B', 'A'],
    ]);

    while (suite.state !== 'completed') suite = advanceFormalSuite(suite, nextValidSample(suite));

    expect(suite.counts).toEqual({ warmup: 16, measuredA: 20, measuredB: 20, total: 56 });
    expect(suite.pairs.every((pair) => pair.state === 'completed')).toBe(true);
    expect(suite.pairs.flatMap((pair) => pair.legs).every((leg) => leg.state === 'completed')).toBe(true);
  });

  it('binds each formal scenario to its own immutable input label and hash', () => {
    const suite = createFormalEvidenceSuite(
      buildRuntimeFingerprint(runtime(false), inputSha256),
      '2026-08-11T00:00:00.000Z',
      'vision',
      'fixed-rubbing-fixture:d34612763cf6',
    );
    expect(suite.scenario).toBe('vision');
    expect(suite.input).toEqual({ label: 'fixed-rubbing-fixture:d34612763cf6', sha256: inputSha256 });
    expect(suite.id).toContain('sme2-vision-abba');
  });

  it('invalidates a suite when thermal status or temperature drift crosses the gate', () => {
    const initial = createFormalEvidenceSuite(buildRuntimeFingerprint(runtime(false), inputSha256), '2026-08-11T00:00:00.000Z');
    const hot = nextValidSample(initial);
    hot.stats = { ...hot.stats, thermalStatus: 2 };
    hot.invalidReason = validateFormalSample(initial, hot) || undefined;
    expect(advanceFormalSuite(initial, hot).invalidations[0].reason).toBe('thermal_status_2_over_1');

    let drifting = advanceFormalSuite(initial, nextValidSample(initial, 35));
    const driftedSample = nextValidSample(drifting, 37.1);
    drifting = advanceFormalSuite(drifting, driftedSample);
    expect(drifting.state).toBe('invalid');
    expect(drifting.invalidations[0].reason).toBe('temperature_drift_over_2C');
  });

  it('rejects resumed runs when the APK/runtime fingerprint or input hash changes', () => {
    const suite = createFormalEvidenceSuite(buildRuntimeFingerprint(runtime(false), inputSha256));
    expect(validateFormalEnvironment(suite, runtime(false), 'b'.repeat(64))).toBe('input_sha256_changed');
    expect(validateFormalEnvironment(suite, runtime(false, { version: 'MNN-3.4.0' }), inputSha256)).toBe('runtime_or_apk_version_changed');
    expect(validateFormalEnvironment(suite, runtime(false, {
      device: { ...runtime(false)?.device, appVersionCode: 2 },
    }), inputSha256)).toBe('runtime_or_apk_version_changed');
  });
});
