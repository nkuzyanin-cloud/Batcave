import { z } from 'zod';
import { ZipWriter, BlobWriter, BlobReader, TextReader, TextWriter } from '@zip.js/zip.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { dbPromise, allComics, getSettings } from './db';
import { openZip, detectFormat } from '../reader/source';
import { type Comic, type Asset, type Settings } from '../models';
export const BACKUP_LIMIT = 300 * 1024 * 1024;
const id = z
  .string()
  .min(1)
  .max(150)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().max(20000);
const natural = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const year = z.number().int().min(1800).max(2200).nullable();
const comicSchema = z
  .object({
    id,
    title: text.min(1),
    series: text,
    authors: text,
    year,
    yearEnd: year.optional(),
    addedAt: natural,
    updatedAt: natural,
    physical: z.enum(['yes', 'no', 'unknown']),
    physicalGroup: id.optional(),
    edition: text,
    publisher: text,
    editionYear: year,
    note: text,
    rating: z.number().int().min(0).max(5),
    completed: z.boolean(),
    page: z.number().int().min(0).max(4999),
    pageCount: z.number().int().min(0).max(5000),
    visited: z.array(z.number().int().min(0).max(4999)).max(5000),
    seconds: z.number().min(0).max(1e12),
    lastOpened: natural,
    digital: z
      .object({
        assetId: id,
        format: z.enum(['pdf', 'cbz', 'image']),
        name: text,
        size: natural,
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .optional(),
    coverId: id.optional(),
    photoId: id.optional(),
    tone: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  })
  .refine(
    (c) =>
      c.visited.every((p) => p < c.pageCount) &&
      new Set(c.visited).size === c.visited.length &&
      (c.pageCount === 0 ? c.page === 0 : c.page < c.pageCount),
    'Повреждён прогресс чтения',
  );
const settingsSchema = z.object({
  mode: z.enum(['single', 'vertical']),
  direction: z.enum(['ltr', 'rtl']),
  motion: z.enum(['system', 'full', 'fast', 'off']),
  readerTheme: z.enum(['black', 'gray', 'light']),
  doubleTap: z.boolean(),
  showPage: z.boolean(),
  groupSeries: z.boolean(),
  sort: z.enum(['added', 'title', 'year']),
});
const assetSchema = z.object({
  id,
  path: z.string().regex(/^assets\/[a-zA-Z0-9_-]+$/),
  size: natural,
  mime: z.string().max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const schema = z
  .object({
    app: z.literal('BATCAVE'),
    version: z.literal(1),
    kind: z.enum(['metadata', 'full']),
    createdAt: natural,
    comics: z.array(comicSchema).max(10000),
    settings: settingsSchema,
    assets: z.array(assetSchema).max(30000),
  })
  .refine(
    (b) =>
      new Set(b.comics.map((c) => c.id)).size === b.comics.length &&
      new Set(b.assets.map((a) => a.id)).size === b.assets.length &&
      new Set(b.assets.map((a) => a.path)).size === b.assets.length,
    'Дубликаты идентификаторов в резервной копии',
  );
export type Backup = z.infer<typeof schema>;
export function parseBackup(value: unknown): Backup {
  const r = schema.safeParse(value);
  if (!r.success)
    throw Error(
      'Некорректная резервная копия BATCAVE или неподдерживаемая версия. Библиотека не изменена.',
    );
  if (r.data.kind === 'metadata' && r.data.assets.length)
    throw Error('В JSON не должно быть файлов.');
  return r.data;
}
export async function checksum(blob: Blob, signal?: AbortSignal) {
  const h = sha256.create();
  for (let offset = 0; offset < blob.size; offset += 4 * 1024 * 1024) {
    if (signal?.aborted) throw new DOMException('Отменено', 'AbortError');
    h.update(new Uint8Array(await blob.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer()));
  }
  return Array.from(h.digest())
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export async function exportMetadata() {
  return new Blob(
    [
      JSON.stringify(
        {
          app: 'BATCAVE',
          version: 1,
          kind: 'metadata',
          createdAt: Date.now(),
          comics: await allComics(),
          settings: await getSettings(),
          assets: [],
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
}
export async function exportFull(onProgress: (message: string) => void) {
  const db = await dbPromise;
  const comics = await allComics();
  const keys = Array.from(
    new Set(
      comics
        .flatMap((c) => [c.digital?.assetId, c.coverId, c.photoId])
        .filter((x): x is string => !!x),
    ),
  );
  let total = 0;
  for (const key of keys) {
    const a = await db.get('assets', key);
    if (!a)
      throw Error('Файл из библиотеки отсутствует. Проверьте цифровые копии перед экспортом.');
    total += a.blob.size;
  }
  if (total > BACKUP_LIMIT)
    throw Error(
      'Полная копия ограничена 300 МБ, чтобы не перегрузить память iPhone. Экспортируйте JSON и сохраните оригиналы отдельно.',
    );
  const writer = new ZipWriter(new BlobWriter('application/zip'), { level: 0 });
  const assets: Backup['assets'] = [];
  try {
    for (const [i, key] of keys.entries()) {
      onProgress(`Упаковка файла ${i + 1} из ${keys.length}`);
      const a = (await db.get('assets', key))!;
      const path = `assets/${key}`;
      assets.push({
        id: key,
        path,
        size: a.blob.size,
        mime: a.blob.type,
        sha256: await checksum(a.blob),
      });
      await writer.add(path, new BlobReader(a.blob));
    }
    await writer.add(
      'batcave.json',
      new TextReader(
        JSON.stringify({
          app: 'BATCAVE',
          version: 1,
          kind: 'full',
          createdAt: Date.now(),
          comics,
          settings: await getSettings(),
          assets,
        }),
      ),
    );
    return await writer.close();
  } catch (e) {
    await writer.close().catch(() => {});
    throw e;
  }
}
export interface PreparedBackup {
  data: Backup;
  assets: Map<string, Asset>;
  conflicts: number;
}
export async function prepareRestore(
  file: File,
  onProgress: (message: string) => void,
): Promise<PreparedBackup> {
  if (file.size > BACKUP_LIMIT + 8 * 1024 * 1024)
    throw Error('Архив больше 308 МБ. Восстановление на iPhone ограничено по памяти.');
  let data: Backup;
  const assets = new Map<string, Asset>();
  if (/\.json$/i.test(file.name)) {
    if (file.size > 8 * 1024 * 1024) throw Error('JSON слишком большой.');
    data = parseBackup(JSON.parse(await file.text()));
    if (data.kind !== 'metadata') throw Error('Полная копия должна быть ZIP-архивом.');
  } else {
    const { zip, entries } = await openZip(file);
    try {
      const manifest = entries.find((e) => e.filename === 'batcave.json');
      if (!manifest || manifest.directory || manifest.uncompressedSize > 8 * 1024 * 1024)
        throw Error('В архиве нет корректного batcave.json.');
      const content = await manifest.getData(new TextWriter(), { checkSignature: true });
      data = parseBackup(JSON.parse(content!));
      if (data.kind !== 'full') throw Error('В архиве нет полной резервной копии.');
      if (data.assets.reduce((n, a) => n + a.size, 0) > BACKUP_LIMIT)
        throw Error('Данные в архиве больше 300 МБ.');
      for (const [i, a] of data.assets.entries()) {
        onProgress(`Проверка файла ${i + 1} из ${data.assets.length}`);
        const e = entries.find((e) => e.filename === a.path);
        if (!e || e.directory || e.encrypted || e.uncompressedSize !== a.size)
          throw Error('Файлы резервной копии отсутствуют или повреждены.');
        const blob = await e.getData(new BlobWriter(a.mime), { checkSignature: true });
        if (!blob || (await checksum(blob)) !== a.sha256)
          throw Error('Контрольная сумма файла не совпадает. Библиотека не изменена.');
        assets.set(a.id, { id: a.id, blob });
      }
      for (const c of data.comics) {
        for (const key of [c.digital?.assetId, c.coverId, c.photoId])
          if (key && !assets.has(key)) throw Error('В полной копии отсутствует вложение.');
        if (c.digital) {
          const blob = assets.get(c.digital.assetId)!.blob;
          if (
            blob.size !== c.digital.size ||
            (await checksum(blob)) !== c.digital.fingerprint ||
            (await detectFormat(blob, c.digital.name)) !== c.digital.format
          )
            throw Error('Цифровой файл не соответствует метаданным.');
        }
      }
    } finally {
      await zip.close();
    }
  }
  const local = await allComics();
  const conflicts = data.comics.filter((c) =>
    local.some(
      (l) =>
        l.id === c.id ||
        (l.digital && c.digital && l.digital.fingerprint === c.digital.fingerprint),
    ),
  ).length;
  return { data, assets, conflicts };
}
export async function restore(
  prepared: PreparedBackup,
  policy: 'keep' | 'replace',
  restoreSettings: boolean,
) {
  const db = await dbPromise;
  const existing = await allComics();
  const existingAssets = new Set(await db.getAllKeys('assets'));
  const result = new Map(existing.map((c) => [c.id, c]));
  const writes: Asset[] = [];
  let imported = 0,
    skipped = 0,
    hydrated = 0;
  for (const raw of prepared.data.comics) {
    const incoming = raw as Comic;
    const old = existing.find(
      (c) =>
        c.id === incoming.id ||
        (c.digital && incoming.digital && c.digital.fingerprint === incoming.digital.fingerprint),
    );
    if (old && policy === 'keep') {
      skipped++;
      if (
        incoming.digital &&
        prepared.assets.has(incoming.digital.assetId) &&
        (!old.digital ||
          (old.digital.fingerprint === incoming.digital.fingerprint &&
            !existingAssets.has(old.digital.assetId)))
      ) {
        const file = prepared.assets.get(incoming.digital.assetId)!;
        writes.push(file);
        result.set(old.id, {
          ...old,
          digital: incoming.digital,
          pageCount: incoming.pageCount,
          page: Math.min(old.page, Math.max(0, incoming.pageCount - 1)),
          visited: old.visited.filter((p) => p < incoming.pageCount),
        });
        hydrated++;
      }
      continue;
    }
    const c: Comic = { ...incoming, id: old?.id || incoming.id };
    for (const key of ['coverId', 'photoId'] as const) {
      const aid = c[key];
      if (aid && prepared.assets.has(aid)) writes.push(prepared.assets.get(aid)!);
      else if (aid && !existingAssets.has(aid)) c[key] = undefined;
    }
    if (c.digital) {
      const asset = prepared.assets.get(c.digital.assetId);
      if (asset) writes.push(asset);
      else if (
        old?.digital?.fingerprint === c.digital.fingerprint &&
        existingAssets.has(old.digital.assetId)
      )
        c.digital = old.digital;
      else c.digital = undefined;
    }
    result.set(c.id, c);
    imported++;
  }
  const referenced = new Set(
    Array.from(result.values())
      .flatMap((c) => [c.digital?.assetId, c.coverId, c.photoId])
      .filter(Boolean),
  );
  const tx = db.transaction(['comics', 'assets', 'config'], 'readwrite');
  for (const a of writes) await tx.objectStore('assets').put(a);
  for (const c of result.values()) await tx.objectStore('comics').put(c);
  for (const aid of existingAssets)
    if (!referenced.has(aid)) await tx.objectStore('assets').delete(aid);
  if (restoreSettings)
    await tx.objectStore('config').put(prepared.data.settings as Settings, 'settings');
  await tx.objectStore('config').put(true, 'initialized');
  await tx.done;
  return { imported, skipped, hydrated };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
