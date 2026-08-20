import { afterEach, describe, expect, it, vi } from 'vitest';

const mockStore = (record: unknown) => {
  const get = vi.fn(async () => record);
  const put = vi.fn(async () => undefined);
  vi.doMock('../skills/keyedStore', () => ({
    keyedStore: () => ({
      get,
      put,
      all: vi.fn(async () => []),
      del: vi.fn(async () => undefined),
    }),
  }));
  return { get, put };
};

describe('splatStore · 导入格式护栏', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('../skills/keyedStore');
  });

  it('按文件名、扩展名或 MIME 归一支持的 3D 格式', async () => {
    vi.resetModules();
    mockStore(null);

    const { normalizeSplatFormat } = await import('./splatStore');

    expect(normalizeSplatFormat('scan.final.GLB')).toBe('glb');
    expect(normalizeSplatFormat('.KSPLAT')).toBe('ksplat');
    expect(normalizeSplatFormat('ply')).toBe('ply');
    expect(normalizeSplatFormat('model/gltf-binary')).toBe('glb');
    expect(normalizeSplatFormat('model/gltf+json')).toBe('gltf');
    expect(normalizeSplatFormat('model/ply')).toBe('ply');
    expect(normalizeSplatFormat('scan.final.GLB?download=1')).toBe('glb');
    expect(normalizeSplatFormat('https://cdn.example.com/gpu/scan.KSPLAT#viewer')).toBe('ksplat');
    expect(normalizeSplatFormat('model/gltf+json; charset=utf-8')).toBe('gltf');
    expect(normalizeSplatFormat('gpu-export.SPZ')).toBe('spz');   // 压缩 3DGS 导出（比 PLY 小约 10 倍）
    expect(normalizeSplatFormat('model.obj')).toBe('');
  });

  it('识别常见但当前不可网页预览的 3D 导出格式', async () => {
    vi.resetModules();
    mockStore(null);

    const { detectUnsupported3DFormat } = await import('./splatStore');

    expect(detectUnsupported3DFormat('scan.USDZ')).toBe('usdz');
    expect(detectUnsupported3DFormat('model/vnd.usdz+zip')).toBe('usdz');
    expect(detectUnsupported3DFormat('mesh.obj?download=1')).toBe('obj');
    expect(detectUnsupported3DFormat('model/stl; charset=binary')).toBe('stl');
    expect(detectUnsupported3DFormat('pointcloud.xyz#raw')).toBe('xyz');
    expect(detectUnsupported3DFormat('scan-results.ZIP')).toBe('zip');
    expect(detectUnsupported3DFormat('application/zip')).toBe('zip');
    expect(detectUnsupported3DFormat('scan-results.RAR')).toBe('rar');
    expect(detectUnsupported3DFormat('scan-results.7z')).toBe('7z');
    expect(detectUnsupported3DFormat('scan-results.tar')).toBe('tar');
    expect(detectUnsupported3DFormat('scan-results.tar.gz')).toBe('tar.gz');
    expect(detectUnsupported3DFormat('gallery-scan.laz')).toBe('laz');
    expect(detectUnsupported3DFormat('gallery-scan.e57')).toBe('e57');
    expect(detectUnsupported3DFormat('raw-cloud.PCD')).toBe('pcd');
    expect(detectUnsupported3DFormat('aligned-points.pts')).toBe('pts');
    expect(detectUnsupported3DFormat('model/vnd.collada+xml')).toBe('dae');
    expect(detectUnsupported3DFormat('mesh.3MF')).toBe('3mf');
    expect(detectUnsupported3DFormat('artifact.drc')).toBe('drc');
    expect(detectUnsupported3DFormat('scan-material.MTL')).toBe('mtl');
    expect(detectUnsupported3DFormat('model/mtl')).toBe('mtl');
    expect(detectUnsupported3DFormat('scaniverse-export.SPZ')).toBe('');   // spz 已入支持白名单（渲染器 0.4.7 原生支持）
    expect(detectUnsupported3DFormat('artifact.glb')).toBe('');
  });

  it('导入失败提示与支持格式白名单保持一致', async () => {
    vi.resetModules();
    mockStore(null);

    const { splatImportFormatErrorMessage } = await import('./splatStore');

    expect(splatImportFormatErrorMessage('scan.USDZ')).toBe('USDZ 暂不能网页预览 · 请导出 .glb/.gltf/.ply/.splat/.ksplat/.spz');
    expect(splatImportFormatErrorMessage('mesh.bin', 'model/stl')).toBe('STL 暂不能网页预览 · 请导出 .glb/.gltf/.ply/.splat/.ksplat/.spz');
    expect(splatImportFormatErrorMessage('scan.zip')).toBe('ZIP 压缩包暂不能直接预览 · 请先解压并选择 .glb/.gltf/.ply/.splat/.ksplat/.spz');
    expect(splatImportFormatErrorMessage('scan-results.tar.gz')).toBe('TAR.GZ 压缩包暂不能直接预览 · 请先解压并选择 .glb/.gltf/.ply/.splat/.ksplat/.spz');
    expect(splatImportFormatErrorMessage('scan-results.7z')).toBe('7Z 压缩包暂不能直接预览 · 请先解压并选择 .glb/.gltf/.ply/.splat/.ksplat/.spz');
    expect(splatImportFormatErrorMessage('gallery-scan.e57')).toBe('E57 暂不能网页预览 · 请导出 .glb/.gltf/.ply/.splat/.ksplat/.spz');
    expect(splatImportFormatErrorMessage('scan-material.mtl')).toBe('MTL 暂不能网页预览 · 请导出 .glb/.gltf/.ply/.splat/.ksplat/.spz');
    expect(splatImportFormatErrorMessage('scan.bin', 'application/octet-stream')).toBe('格式不支持 · 请选择 .glb/.gltf/.ply/.splat/.ksplat/.spz');
  });

  it('空文件或不支持格式不会写入 IndexedDB', async () => {
    vi.resetModules();
    const { put } = mockStore(null);

    const { putSplat } = await import('./splatStore');

    await expect(putSplat(new Blob(['mesh']), 'obj')).rejects.toThrow('unsupported splat format');
    await expect(putSplat(new Blob([]), 'ply')).rejects.toThrow('empty splat blob');
    expect(put).not.toHaveBeenCalled();
  });

  it('保存时会写入归一后的格式和字节数', async () => {
    vi.resetModules();
    const { put } = mockStore(null);

    const { putSplat } = await import('./splatStore');
    const id = await putSplat(new Blob(['ply']), 'MODEL.PLY');

    expect(id).toMatch(/^splat-/);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ id, format: 'ply', bytes: 3 }));
  });
});

describe('splatStore · objectURL 兜底', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('../skills/keyedStore');
  });

  it('本地 3D blob 读到但 objectURL 不可用时返回空串', async () => {
    vi.resetModules();
    mockStore({ id: 'splat-1', blob: new Blob(['ply']), format: 'ply', bytes: 3, ts: 1 });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('objectURL disabled'); });

    const { getSplatObjectUrl } = await import('./splatStore');

    await expect(getSplatObjectUrl('splat-1')).resolves.toBe('');
  });

  it('同一 splatId 复用 objectURL，并在释放时 revoke', async () => {
    vi.resetModules();
    const { get } = mockStore({ id: 'splat-2', blob: new Blob(['ply']), format: 'ply', bytes: 3, ts: 1 });
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:exhibition-splat');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const { getSplatObjectUrl, releaseSplatUrl } = await import('./splatStore');

    await expect(getSplatObjectUrl('splat-2')).resolves.toBe('blob:exhibition-splat');
    await expect(getSplatObjectUrl('splat-2')).resolves.toBe('blob:exhibition-splat');
    expect(get).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    releaseSplatUrl('splat-2');

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:exhibition-splat');
  });
});
