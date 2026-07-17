import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from './config';

describe('@g3/mobile — khung khởi tạo', () => {
  it('đang ở giai đoạn khung, nhắm Android tầm trung (NF-13)', () => {
    expect(APP_CONFIG.stage).toBe('khung');
    expect(APP_CONFIG.targetPlatform).toBe('android');
  });
});
