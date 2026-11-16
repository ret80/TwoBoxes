import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player, SDK } from 'ysdk';
import { YandexCloudSave } from './YandexCloudSave';

/** Поддельный игрок площадки: облако — обычный объект в памяти. */
function fakeSdk(cloud: Record<string, unknown>): {
  sdk: SDK;
  setData: ReturnType<typeof vi.fn>;
  cloud: Record<string, unknown>;
} {
  const setData = vi.fn(async (data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      if (value === null) delete cloud[key];
      else cloud[key] = value;
    }
  });
  const player = {
    getData: async () => ({ ...cloud }),
    setData,
  } as unknown as Player;
  const sdk = { getPlayer: async () => player } as unknown as SDK;
  return { sdk, setData, cloud };
}

describe('YandexCloudSave', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('без площадки ведёт себя как localStorage', async () => {
    const storage = new YandexCloudSave({ cloudKeys: ['save'] });
    await storage.init(null);
    storage.save('save', { level: 3 });
    expect(storage.load('save')).toEqual({ level: 3 });
    storage.remove('save');
    expect(storage.load('save')).toBeNull();
  });

  it('отдаёт прогресс из облака, если локальный старее', async () => {
    localStorage.setItem('2boxpuzzle:savedAt', '1');
    const { sdk } = fakeSdk({ save: { level: 5 }, savedAt: 1000 });
    const restored: [string, unknown][] = [];
    const storage = new YandexCloudSave({
      cloudKeys: ['save'],
      onRestore: (key, value) => {
        restored.push([key, value]);
        return true;
      },
    });
    await storage.init(sdk);
    expect(storage.load('save')).toEqual({ level: 5 });
    expect(restored).toEqual([['save', { level: 5 }]]);
  });

  it('локальный прогресс новее облачного — уходит наверх', async () => {
    vi.useFakeTimers();
    localStorage.setItem('2boxpuzzle:save', JSON.stringify({ level: 7 }));
    localStorage.setItem('2boxpuzzle:savedAt', '2000');
    const { sdk, setData, cloud } = fakeSdk({ save: { level: 1 }, savedAt: 1000 });
    const storage = new YandexCloudSave({ cloudKeys: ['save'] });
    await storage.init(sdk);
    vi.advanceTimersByTime(2000);
    expect(storage.load('save')).toEqual({ level: 7 });
    expect(setData).toHaveBeenCalled();
    expect(cloud.save).toEqual({ level: 7 });
  });

  it('запись до ответа площадки не затирается облаком', async () => {
    const { sdk } = fakeSdk({ save: { level: 1 }, savedAt: 1000 });
    const storage = new YandexCloudSave({ cloudKeys: ['save'] });
    storage.save('save', { level: 9 });
    await storage.init(sdk);
    expect(storage.load('save')).toEqual({ level: 9 });
  });

  it('несовместимое облачное сохранение уходит в резервную копию', async () => {
    const { sdk, cloud } = fakeSdk({ save: { version: 99 }, savedAt: 1000 });
    const storage = new YandexCloudSave({
      cloudKeys: ['save'],
      onRestore: () => false,
    });
    await storage.init(sdk);
    // В кэш игры чужое значение не попало.
    expect(storage.load('save')).toBeNull();
    // А в облаке и локально осталась копия, которую новая игра не перетирает.
    expect(cloud['save-backup']).toEqual({ version: 99 });
    expect(storage.load('save-backup')).toEqual({ version: 99 });
  });

  it('сессионная запись побеждает облако даже при отстающих часах устройства', async () => {
    // Облачная метка «из будущего»: сравнивать её с локальными часами нельзя.
    const { sdk } = fakeSdk({ save: { level: 1 }, savedAt: 9e15 });
    const storage = new YandexCloudSave({ cloudKeys: ['save'] });
    storage.save('save', { level: 9 });
    await storage.init(sdk);
    expect(storage.load('save')).toEqual({ level: 9 });
  });

  it('пустое облако получает локальный прогресс', async () => {
    vi.useFakeTimers();
    localStorage.setItem('2boxpuzzle:save', JSON.stringify({ level: 2 }));
    localStorage.setItem('2boxpuzzle:savedAt', '500');
    const { sdk, setData, cloud } = fakeSdk({});
    const storage = new YandexCloudSave({ cloudKeys: ['save'] });
    await storage.init(sdk);
    vi.advanceTimersByTime(2000);
    expect(setData).toHaveBeenCalled();
    expect(cloud.save).toEqual({ level: 2 });
  });

  it('пишет локально сразу, а в облако — с задержкой одним пакетом', async () => {
    vi.useFakeTimers();
    const { sdk, setData } = fakeSdk({ save: { level: 1 }, savedAt: 1000 });
    const storage = new YandexCloudSave({ cloudKeys: ['save'] });
    await storage.init(sdk);
    setData.mockClear();

    storage.save('save', { level: 2 });
    storage.save('save', { level: 3 });
    expect(storage.load('save')).toEqual({ level: 3 });
    expect(setData).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData.mock.calls[0][0]).toMatchObject({ save: { level: 3 } });
  });

  it('сброс прогресса удаляет ключ из облака', async () => {
    const { sdk, cloud } = fakeSdk({ save: { level: 4 }, savedAt: 1000 });
    const storage = new YandexCloudSave({ cloudKeys: ['save'] });
    await storage.init(sdk);
    storage.remove('save');
    expect(storage.load('save')).toBeNull();
    expect('save' in cloud).toBe(false);
  });

  it('настройки мимо облака остаются локальными', async () => {
    vi.useFakeTimers();
    const { sdk, setData } = fakeSdk({ save: { level: 1 }, savedAt: 1000 });
    const storage = new YandexCloudSave({ cloudKeys: ['save'] });
    await storage.init(sdk);
    setData.mockClear();
    storage.save('theme', 'dark');
    vi.advanceTimersByTime(2000);
    expect(storage.load('theme')).toBe('dark');
    expect(setData).not.toHaveBeenCalled();
  });
});
