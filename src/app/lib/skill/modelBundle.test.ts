import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_SKILLS } from './builtins';

interface BundleFile { path: string; bytes: number; sha256: string }
interface BundleManifest {
  protocol: string;
  releaseId: string;
  totalBytes: number;
  bundles: Record<string, { target: string; files: BundleFile[] }>;
}
interface OssRelease { objects: Array<{ key: string; bytes: number; sha256: string }> }

const manifestPath = resolve(process.cwd(), 'android/native/model-bundle.manifest.json');
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8')) as BundleManifest;
const manifestSha = createHash('sha256').update(manifestBytes).digest('hex');
const pluginSource = readFileSync(resolve(process.cwd(), 'android/app/src/main/java/art/throughtheglass/pocketearth/PocketMnnPlugin.java'), 'utf8');
const ossRelease = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/deploy/oss-release-20260811.json'), 'utf8')) as OssRelease;

describe('Android MNN dual-base release contract', () => {
  it('has a self-consistent immutable descriptor', () => {
    const files = Object.values(manifest.bundles).flatMap((bundle) => bundle.files);
    expect(manifest.protocol).toBe('pocket-mnn-model-bundle/v1');
    expect(manifest.releaseId).toBe('pocketearth-qwen3-vl-2b-dual-base-20260811');
    expect(Object.values(manifest.bundles).map((bundle) => bundle.target)).toEqual([
      'qwen3-vl-2b-language', 'qwen3-vl-2b-vision',
    ]);
    expect(files).toHaveLength(14);
    expect(files.reduce((sum, file) => sum + file.bytes, 0)).toBe(manifest.totalBytes);
    expect(files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256) && file.bytes > 0)).toBe(true);
  });

  it('pins every built-in MNN Skill to this exact dual-base descriptor', () => {
    const mnnSkills = BUILTIN_SKILLS.filter((skill) => skill.runtime.execution === 'mnn');
    expect(mnnSkills.length).toBeGreaterThan(0);
    for (const skill of mnnSkills) {
      expect(skill.runtime.base).toEqual({
        id: 'qwen3-vl-2b-mnn-dual',
        revision: 'pocketearth-dual-base-20260811',
        sha256: manifestSha,
      });
    }
  });

  it('keeps Android native asset pins equal to the OSS release and built-in Skills', () => {
    const nativePins = new Map<string, { bytes: number; sha256: string }>();
    for (const match of pluginSource.matchAll(/if \("([^"]+)"\.equals\(id\)\) return new AssetSpec\((\d+)L, "([0-9a-f]{64})"\);/g)) {
      nativePins.set(match[1], { bytes: Number(match[2]), sha256: match[3] });
    }
    expect(nativePins.size).toBe(6);

    const releasePins = new Map(ossRelease.objects.map((item) => [
      item.key.split('/')[2], { bytes: item.bytes, sha256: item.sha256 },
    ]));
    expect(nativePins).toEqual(releasePins);

    const builtinAssets = BUILTIN_SKILLS.flatMap((skill) => skill.assets);
    for (const asset of builtinAssets) {
      expect(nativePins.get(asset.id)).toEqual({ bytes: asset.bytes, sha256: asset.sha256 });
    }
  });
});
