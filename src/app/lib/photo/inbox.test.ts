import { describe, expect, it } from 'vitest';
import { consumePhotoOrganizerRequest, submitPhotoOrganizerRequest } from './inbox';

describe('photo organizer handoff', () => {
  it('delivers a Frost photo request once to the Photos tab', () => {
    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    submitPhotoOrganizerRequest({ files: [file], objective: '筛选适合杂志的照片' });
    expect(consumePhotoOrganizerRequest()).toMatchObject({ files: [file], objective: '筛选适合杂志的照片' });
    expect(consumePhotoOrganizerRequest()).toBeNull();
  });
});
