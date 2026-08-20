import { beforeEach, describe, expect, it } from 'vitest';
import { addPhotoPins, clearPhotoPins, getPhotoPins, photoPinIdentity } from './geoPin';

describe('photo Earth pin identity', () => {
  beforeEach(() => clearPhotoPins());

  it('combines stable asset key and content hash', () => {
    expect(photoPinIdentity('native-library:image:42', 'aabbcc')).toBe('native-library:image:42|aabbcc');
    expect(photoPinIdentity('native-library:image:43', 'aabbcc')).not.toBe(photoPinIdentity('native-library:image:42', 'aabbcc'));
  });

  it('is idempotent across repeated confirmations and preserves the local asset reference', async () => {
    const item = {
      id: photoPinIdentity('native-library:image:42', 'aabbcc'), assetKey: 'native-library:image:42', contentHash: 'aabbcc',
      lat: 30.25, lng: 120.16, thumb: '', name: '本地照片', source: 'exif' as const, ts: 1,
    };
    await addPhotoPins([item]);
    await addPhotoPins([item]);
    expect(getPhotoPins()).toHaveLength(1);
    expect(getPhotoPins()[0]).toMatchObject({ assetKey: 'native-library:image:42', contentHash: 'aabbcc' });
  });
});
