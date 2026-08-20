import { describe, expect, it } from 'vitest';
import { isPrivacySensitiveInput } from './router';

describe('Router privacy cloud guard', () => {
  it('blocks obvious private identifiers from silent cloud escalation', () => {
    expect(isPrivacySensitiveInput('帮我整理身份证和家庭住址')).toBe(true);
    expect(isPrivacySensitiveInput('分析这张私密照片')).toBe(true);
  });

  it('allows ordinary cultural questions to use the cloud route', () => {
    expect(isPrivacySensitiveInput('讲讲杭州南宋官窑')).toBe(false);
  });
});
