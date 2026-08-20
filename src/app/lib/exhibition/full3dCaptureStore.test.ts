import { describe, expect, it } from 'vitest';
import {
  captureManifest,
  FULL3D_MAX_VIEWS,
  FULL3D_MIN_VIEWS,
  validateFull3DFiles,
  type Full3DCaptureJob,
} from './full3dCaptureStore';

const imageFile = (name: string, bytes = 4) => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });

describe('高清 3D 采集合同', () => {
  it('只接受图片并限制 80 张', () => {
    expect(() => validateFull3DFiles([imageFile('a.jpg')])).not.toThrow();
    expect(() => validateFull3DFiles([new File(['x'], 'a.txt', { type: 'text/plain' })])).toThrow('capture_file_not_image');
    expect(() => validateFull3DFiles(Array.from({ length: FULL3D_MAX_VIEWS + 1 }, (_, i) => imageFile(`${i}.jpg`)))).toThrow('too_many_capture_files');
  });

  it('20 张才允许上传自有 GPU，且清单不含 Blob', () => {
    const frames = Array.from({ length: FULL3D_MIN_VIEWS }, (_, index) => ({
      name: `${index}.jpg`, type: 'image/jpeg', size: 4, lastModified: 0, sha256: String(index).padStart(64, '0'), blob: new Blob(['test']),
    }));
    const job: Full3DCaptureJob = { id: 'capture-1', artifactId: 'art-1', createdAt: 1, updatedAt: 2, poseRoute: 'colmap-moving-camera', frames };
    const manifest = captureManifest(job);
    expect(manifest.readyToBuild).toBe(true);
    expect(manifest.views).toBe(20);
    expect(manifest.frames[0]).not.toHaveProperty('blob');
    expect(manifest.poseRoute).toBe('colmap-moving-camera');
  });
});
