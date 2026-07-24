// 插件参数配置存储单测（node 环境，沙盒内存后端）
import { describe, it, expect } from 'vitest';
import {
  SettingsStore,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
} from '../core/settings/store.ts';

describe('SettingsStore', () => {
  it('getSettings 默认值回填：无存储时返回默认完整对象', async () => {
    const store = new SettingsStore(SettingsStore.memoryBackend());
    const s = await store.getSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.autoInject).toBe(true);
    expect(s.injectionLimit).toBe(8000);
    expect(s.syncStrategy).toBe('local');
    expect(s.theme).toBe('system');
  });

  it('getSettings 缺失字段回填默认，脏字段被规整', async () => {
    // 只存了部分字段，且注入非法枚举值
    const store = new SettingsStore(
      SettingsStore.memoryBackend({
        [SETTINGS_STORAGE_KEY]: { autoInject: false, theme: 'neon' },
      }),
    );
    const s = await store.getSettings();
    expect(s.autoInject).toBe(false); // 已存值保留
    expect(s.injectionLimit).toBe(DEFAULT_SETTINGS.injectionLimit); // 缺失回填
    expect(s.theme).toBe('system'); // 非法枚举被规整回默认
  });

  it('updateSettings 局部更新并返回合并后的完整对象', async () => {
    const store = new SettingsStore(SettingsStore.memoryBackend());
    const updated = await store.updateSettings({ injectionLimit: 4000, theme: 'dark' });
    expect(updated.autoInject).toBe(true); // 未改字段保留默认
    expect(updated.injectionLimit).toBe(4000);
    expect(updated.theme).toBe('dark');
    // 二次读取仍是合并后的值
    const again = await store.getSettings();
    expect(again.injectionLimit).toBe(4000);
    expect(again.theme).toBe('dark');
  });

  it('resetSettings 复位为默认', async () => {
    const store = new SettingsStore(SettingsStore.memoryBackend());
    await store.updateSettings({ autoInject: false, injectionLimit: 100 });
    const reset = await store.resetSettings();
    expect(reset).toEqual(DEFAULT_SETTINGS);
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
