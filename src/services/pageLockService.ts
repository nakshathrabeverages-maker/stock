import { settingsService } from '@/services/settingsService';

const LOCK_KEY_PREFIX = 'pageLock_';

export const pageLockService = {
  buildKey(pageKey: string) {
    return `${LOCK_KEY_PREFIX}${pageKey}`;
  },

  async getPageLockDate(pageKey: string): Promise<Date | null> {
    const key = this.buildKey(pageKey);
    const value = await settingsService.getValue(key);
    if (!value || value <= 0) {
      return null;
    }
    return new Date(value);
  },

  async setPageLockDate(pageKey: string, lockDate: Date | null) {
    const key = this.buildKey(pageKey);
    if (!lockDate) {
      return this.clearPageLock(pageKey);
    }
    return settingsService.setValue(key, lockDate.getTime());
  },

  async clearPageLock(pageKey: string) {
    const key = this.buildKey(pageKey);
    return settingsService.setValue(key, 0);
  },
};
