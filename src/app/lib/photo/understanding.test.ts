import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPhotoVision } from '../../../../frost-agent/edge/httpPhotoEdge';
import {
  chooseOcrEvidence,
  ocrQualityScore,
  parseOcrDocument,
  parsePhotoUnderstanding,
  shouldEscalateOcr,
} from './understanding';

describe('Qwen photo output gates', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('parses fenced structured understanding and clamps confidence', () => {
    const parsed = parsePhotoUnderstanding('```json\n{"description":"窗边的猫","tags":["猫","室内"],"photoCategory":"real-life","documentKind":"none","hasPeople":false,"hasPet":true,"hasQrCode":false,"hardDocument":false,"confidence":92}\n```');
    expect(parsed?.tags).toEqual(['猫', '室内']);
    expect(parsed?.photoCategory).toBe('real-life');
    expect(parsed?.confidence).toBe(0.92);
    expect(parsed?.sourceType).toBe('real_photo');
  });

  it('parses the fixed photo router schema and rejects unknown privacy labels', () => {
    const parsed = parsePhotoUnderstanding(JSON.stringify({
      sourceType: 'document_photo', content: ['ticket', 'qr'], documentType: 'ticket', needsOcr: true,
      privacyRisk: ['qr', 'password'], route: 'ocr', description: '一张带二维码的票', hardDocument: true, confidence: 0.88,
    }));
    expect(parsed).toMatchObject({
      sourceType: 'document_photo', documentType: 'ticket', documentKind: 'ticket', needsOcr: true,
      privacyRisk: ['qr'], route: 'ocr', hardDocument: true, hasQrCode: true,
    });
  });

  it('fails closed on prose, missing canonical fields, or illegal route enums', () => {
    expect(parsePhotoUnderstanding('这是一张猫照片')).toBeNull();
    expect(parsePhotoUnderstanding('{"sourceType":"real_photo","content":["cat"]}')).toBeNull();
    expect(parsePhotoUnderstanding(JSON.stringify({
      sourceType: 'real_photo', content: ['cat'], documentType: 'none', needsOcr: false,
      privacyRisk: [], route: 'delete', description: '猫', hardDocument: false, confidence: 0.9,
    }))).toBeNull();
  });

  it('keeps a clean base OCR result out of the LoRA route', () => {
    const base = parseOcrDocument('{"kind":"receipt","text":"杭州停车服务 2026-08-10 应收金额 20.00 元 订单 892341","merchant":"杭州停车服务","amount":"20.00","date":"2026-08-10","identifiers":["892341"],"confidence":0.94}');
    expect(ocrQualityScore(base)).toBeGreaterThan(0.62);
    expect(shouldEscalateOcr(base, false)).toBe(false);
    expect(chooseOcrEvidence(base, null, false).qualityGate).toBe('base-accepted');
  });

  it('accepts LoRA only when it materially beats the base result', () => {
    const base = parseOcrDocument('{"kind":"receipt","text":"停车 20","identifiers":[],"confidence":0.45}');
    const improved = parseOcrDocument('{"kind":"receipt","text":"杭州停车服务 应收金额 20.00 元 订单 892341","merchant":"杭州停车服务","amount":"20.00","identifiers":["892341"],"confidence":0.9}');
    const regressed = parseOcrDocument('{"kind":"receipt","text":"停停停停停停停停停","identifiers":[],"confidence":0.3}');
    expect(chooseOcrEvidence(base, improved, true).qualityGate).toBe('lora-accepted');
    expect(chooseOcrEvidence(improved, regressed, true).qualityGate).toBe('base-kept');
  });

  it('requires human review when close Base and LoRA candidates disagree on critical fields', () => {
    const base = parseOcrDocument('{"kind":"receipt","text":"西湖停车 应收金额 29.08 合计 20.00 2026-08-08","merchant":"西湖停车","amount":"20.00","date":"2026-08-08","identifiers":["A001"],"confidence":0.95}');
    const enhanced = parseOcrDocument('{"kind":"receipt","text":"西湖停车 应收金额 29.00 合计 20.00 2026-08-11","merchant":"西湖停车","amount":"29.00","date":"2026-08-11","identifiers":["A001"],"confidence":0.95}');
    const result = chooseOcrEvidence(base, enhanced, true);
    expect(result.qualityGate).toBe('manual-review');
    expect(result.route).toBe('manual');
    expect(result.conflicts).toEqual(['amount', 'date']);
    expect(result.candidates?.base.amount).toBe('20.00');
    expect(result.candidates?.enhanced?.date).toBe('2026-08-11');
  });

  it('keeps a usable Base result when the optional adapter is unavailable', () => {
    const base = parseOcrDocument('{"kind":"ticket","text":"杭州东站 2026-08-11 G7311 检票口 8A","merchant":"杭州东站","date":"2026-08-11","identifiers":["G7311","8A"],"confidence":0.9}');
    expect(shouldEscalateOcr(base, true)).toBe(true);
    const result = chooseOcrEvidence(base, null, false);
    expect(result).toMatchObject({ qualityGate: 'base-accepted', route: 'base' });
  });

  it('sends an unusable Base result to manual review instead of fabricating fields', () => {
    const broken = parseOcrDocument('{"kind":"receipt","text":"票票票票票票票票票","identifiers":[],"confidence":0.25}');
    const result = chooseOcrEvidence(broken, null, false);
    expect(result).toMatchObject({ qualityGate: 'manual-review', route: 'manual' });
  });

  it('cancels an in-flight local vision request without waiting for the long model timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })));
    const controller = new AbortController();
    const request = runPhotoVision('data:image/png;base64,AA==', 'test', { signal: controller.signal });
    controller.abort();
    await expect(request).resolves.toMatchObject({ backend: 'stub' });
  });
});
