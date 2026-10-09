import { openDB, type DBSchema } from 'idb';
import { type Comic, type Asset, type Settings, defaultSettings } from '../models';
import { initialCatalog } from '../data/catalog';
interface Schema extends DBSchema {
  comics: { key: string; value: Comic };
  assets: { key: string; value: Asset };
  config: { key: string; value: unknown };
}
export const dbPromise = openDB<Schema>('batcave-reader', 1, {
  upgrade(db) {
    db.createObjectStore('comics', { keyPath: 'id' });
    db.createObjectStore('assets', { keyPath: 'id' });
    db.createObjectStore('config');
  },
  blocked() {
    window.dispatchEvent(new Event('batcave-blocked'));
  },
  blocking() {
    void dbPromise.then((db) => db.close());
  },
});
export async function initialize() {
  const db = await dbPromise;
  const tx = db.transaction(['comics', 'config'], 'readwrite');
  if (!(await tx.objectStore('config').get('initialized'))) {
    for (const c of initialCatalog()) await tx.objectStore('comics').put(c);
    await tx.objectStore('config').put(true, 'initialized');
  }
  await tx.done;
}
export async function allComics() {
  return (await dbPromise).getAll('comics');
}
export async function getAsset(id: string) {
  return (await dbPromise).get('assets', id);
}
export async function saveSettings(s: Settings) {
  await (await dbPromise).put('config', s, 'settings');
}
export async function getSettings(): Promise<Settings> {
  return {
    ...defaultSettings,
    ...((await (await dbPromise).get('config', 'settings')) as Partial<Settings> | undefined),
  };
}
export async function saveComic(comic: Comic, assets: Asset[] = [], remove: string[] = []) {
  const db = await dbPromise;
  const tx = db.transaction(['comics', 'assets'], 'readwrite');
  for (const a of assets) await tx.objectStore('assets').put(a);
  for (const id of remove) await tx.objectStore('assets').delete(id);
  await tx.objectStore('comics').put({ ...comic, updatedAt: Date.now() });
  await tx.done;
}
export async function updateProgress(id: string, page: number, loaded: boolean, seconds = 0) {
  const db = await dbPromise;
  const tx = db.transaction('comics', 'readwrite');
  const c = await tx.store.get(id);
  if (c) {
    const p = Math.min(Math.max(0, page), Math.max(0, c.pageCount - 1));
    const visited = loaded
      ? Array.from(new Set([...c.visited, p])).sort((a, b) => a - b)
      : c.visited;
    await tx.store.put({
      ...c,
      page: p,
      visited,
      seconds: c.seconds + Math.max(0, seconds),
      completed: c.completed || (c.pageCount > 0 && visited.length === c.pageCount),
      lastOpened: Date.now(),
      updatedAt: Date.now(),
    });
  }
  await tx.done;
}
export async function deleteDigital(c: Comic) {
  const db = await dbPromise;
  const tx = db.transaction(['comics', 'assets'], 'readwrite');
  const latest = await tx.objectStore('comics').get(c.id);
  if (latest) {
    if (latest.digital) await tx.objectStore('assets').delete(latest.digital.assetId);
    await tx.objectStore('comics').put({ ...latest, digital: undefined, updatedAt: Date.now() });
  }
  await tx.done;
}
export async function deleteComic(c: Comic) {
  const db = await dbPromise;
  const tx = db.transaction(['comics', 'assets'], 'readwrite');
  const latest = await tx.objectStore('comics').get(c.id);
  await tx.objectStore('comics').delete(c.id);
  for (const id of [latest?.digital?.assetId, latest?.coverId, latest?.photoId])
    if (id) await tx.objectStore('assets').delete(id);
  await tx.done;
}
export async function resetProgress() {
  const db = await dbPromise;
  const tx = db.transaction('comics', 'readwrite');
  for (const c of await tx.store.getAll())
    await tx.store.put({
      ...c,
      page: 0,
      visited: [],
      completed: false,
      seconds: 0,
      lastOpened: 0,
      updatedAt: Date.now(),
    });
  await tx.done;
}
export async function usage() {
  const db = await dbPromise;
  let local = 0;
  for await (const cursor of db.transaction('assets').store) {
    local += cursor.value.blob.size;
  }
  const estimate = await navigator.storage?.estimate?.().catch(() => ({}) as StorageEstimate);
  return { local, estimate };
}
