import { ZipReader, BlobReader, BlobWriter, configure, type FileEntry } from '@zip.js/zip.js';
import {
  getDocument,
  GlobalWorkerOptions,
  PDFDataRangeTransport,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Format } from '../models';
import { sha256 } from '@noble/hashes/sha2.js';
import { imageSize } from './image-size';
GlobalWorkerOptions.workerSrc = workerUrl;
configure({ useWebWorkers: false }); // Native DecompressionStream is used; no CDN or remote worker.
export const FILE_LIMIT = 600 * 1024 * 1024;
export const PAGE_LIMIT = 32 * 1024 * 1024;
export const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
export const imageName = (s: string) => /\.(jpe?g|png|webp)$/i.test(s);
export function mimeFor(s: string) {
  return /\.png$/i.test(s) ? 'image/png' : /\.webp$/i.test(s) ? 'image/webp' : 'image/jpeg';
}
export async function detectFormat(blob: Blob, name: string): Promise<Format> {
  if (!blob.size) throw Error('Файл пуст.');
  if (blob.size > FILE_LIMIT)
    throw Error('Файл больше 600 МБ. Для надёжной работы на iPhone разделите его на тома.');
  const head = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
  const str = new TextDecoder().decode(head);
  if (/\.cbr$/i.test(name) || str.startsWith('Rar!'))
    throw Error(
      'CBR / RAR не поддерживается. Распакуйте архив и создайте ZIP / CBZ; переименование расширения не конвертирует файл.',
    );
  if (/\.pdf$/i.test(name) && str.includes('%PDF-')) return 'pdf';
  if (/\.(cbz|zip)$/i.test(name) && head[0] === 80 && head[1] === 75) return 'cbz';
  if (
    imageName(name) &&
    ((head[0] === 255 && head[1] === 216) ||
      (head[0] === 137 && str.slice(1, 4) === 'PNG') ||
      (str.startsWith('RIFF') && str.slice(8, 12) === 'WEBP'))
  )
    return 'image';
  throw Error('Формат не соответствует содержимому файла. Выберите PDF, CBZ, JPG, PNG или WebP.');
}
export async function openZip(blob: Blob) {
  const zip = new ZipReader(new BlobReader(blob), {
    checkSignature: true,
    checkOverlappingEntry: true,
  });
  try {
    const entries = await zip.getEntries();
    if (entries.length > 10000) throw Error('Слишком много файлов в архиве.');
    return { zip, entries };
  } catch (e) {
    await zip.close();
    throw e;
  }
}
export function comicEntries(
  entries: Awaited<ReturnType<ZipReader<Blob>['getEntries']>>,
): FileEntry[] {
  const pages = entries
    .filter(
      (e): e is FileEntry =>
        !e.directory &&
        imageName(e.filename) &&
        !e.filename.startsWith('__MACOSX/') &&
        !e.filename.split('/').some((p) => p.startsWith('.')),
    )
    .sort((a, b) => naturalCompare(a.filename, b.filename));
  if (!pages.length) throw Error('В CBZ нет страниц JPG, PNG или WebP.');
  if (pages.length > 5000) throw Error('Больше 5000 страниц: разделите комикс на тома.');
  if (pages.some((e) => e.encrypted)) throw Error('Архив защищён паролем. Сначала распакуйте его.');
  if (
    pages.some((e) => e.uncompressedSize > PAGE_LIMIT) ||
    pages.reduce((s, e) => s + e.uncompressedSize, 0) > 2 * 1024 ** 3
  )
    throw Error(
      'Архив содержит слишком большие страницы (лимит 32 МБ на страницу, 2 ГБ суммарно).',
    );
  return pages;
}
class BlobRange extends PDFDataRangeTransport {
  stopped = false;
  constructor(
    private blob: Blob,
    data: Uint8Array,
  ) {
    super(blob.size, data);
  }
  requestDataRange(begin: number, end: number) {
    void this.blob
      .slice(begin, end)
      .arrayBuffer()
      .then((buf) => {
        if (!this.stopped) this.onDataRange(begin, new Uint8Array(buf));
      });
  }
  abort() {
    this.stopped = true;
  }
}
export interface PageSource {
  count: number;
  ratio: number;
  render: (
    index: number,
    canvas: HTMLCanvasElement,
    width: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  close: () => Promise<void>;
}
export async function imageToCanvas(
  blob: Blob,
  canvas: HTMLCanvasElement,
  width: number,
  signal?: AbortSignal,
) {
  await imageSize(blob);
  const url = URL.createObjectURL(blob);
  const img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(Error('Не удалось прочитать изображение страницы.'));
      img.src = url;
      signal?.addEventListener('abort', () => reject(new DOMException('Отменено', 'AbortError')), {
        once: true,
      });
    });
    if (signal?.aborted) throw new DOMException('Отменено', 'AbortError');
    if (img.width * img.height > 100_000_000)
      throw Error('Изображение слишком большое для безопасного чтения.');
    const scale = Math.min(width / img.width, 1.8, Math.sqrt(4_000_000 / (img.width * img.height)));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
    img.src = '';
  }
}
export async function openSource(blob: Blob, format: Format): Promise<PageSource> {
  if (format === 'pdf') {
    const transport = new BlobRange(blob, new Uint8Array(await blob.slice(0, 65536).arrayBuffer()));
    const base = new URL('./pdf/', new URL(import.meta.env.BASE_URL, document.baseURI));
    const task = getDocument({
      range: transport,
      rangeChunkSize: 65536,
      disableAutoFetch: true,
      disableStream: true,
      cMapUrl: new URL('cmaps/', base).href,
      cMapPacked: true,
      standardFontDataUrl: new URL('standard_fonts/', base).href,
      wasmUrl: new URL('wasm/', base).href,
      iccUrl: new URL('iccs/', base).href,
      maxImageSize: 32_000_000,
    });
    const timeout = setTimeout(() => {
      void task.destroy();
    }, 45000);
    let pdf: PDFDocumentProxy;
    try {
      pdf = await task.promise;
      clearTimeout(timeout);
      if (pdf.numPages > 5000) throw Error('Больше 5000 страниц: разделите PDF на тома.');
    } catch (e) {
      clearTimeout(timeout);
      await task.destroy();
      throw e;
    }
    const p = await pdf.getPage(1);
    const v = p.getViewport({ scale: 1 });
    const ratio = v.height / v.width;
    p.cleanup();
    return {
      count: pdf.numPages,
      ratio,
      async render(index, canvas, width, signal) {
        if (signal?.aborted) return;
        const page = await pdf.getPage(index + 1);
        const vp = page.getViewport({ scale: 1 });
        const scale = Math.min(width / vp.width, Math.sqrt(4_000_000 / (vp.width * vp.height)));
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        let renderTask: RenderTask | undefined;
        const cancel = () => renderTask?.cancel();
        signal?.addEventListener('abort', cancel, { once: true });
        try {
          if (signal?.aborted) return;
          renderTask = page.render({ canvas, viewport });
          await renderTask.promise;
        } finally {
          signal?.removeEventListener('abort', cancel);
          page.cleanup();
        }
      },
      async close() {
        transport.abort();
        await task.destroy();
      },
    };
  }
  if (format === 'cbz') {
    const { zip, entries } = await openZip(blob);
    let pages: FileEntry[];
    try {
      pages = comicEntries(entries);
    } catch (e) {
      await zip.close();
      throw e;
    }
    return {
      count: pages.length,
      ratio: 1.5,
      async render(index, canvas, width, signal) {
        const entry = pages[index];
        if (signal?.aborted) return;
        const data = await entry.getData(new BlobWriter(mimeFor(entry.filename)), {
          checkSignature: true,
          signal,
        });
        if (!data) throw Error('Повреждённая страница CBZ.');
        await imageToCanvas(data, canvas, width, signal);
      },
      async close() {
        await zip.close();
      },
    };
  }
  return {
    count: 1,
    ratio: 1.5,
    render: (_index, canvas, width, signal) => imageToCanvas(blob, canvas, width, signal),
    close: async () => {},
  };
}
export interface ImportPreview {
  format: Format;
  count: number;
  cover: Blob;
}
export async function inspectFile(
  blob: Blob,
  name: string,
  signal?: AbortSignal,
): Promise<ImportPreview> {
  const format = await detectFormat(blob, name);
  const source = await openSource(blob, format);
  try {
    if (signal?.aborted) throw new DOMException('Отменено', 'AbortError');
    const canvas = document.createElement('canvas');
    await source.render(0, canvas, 420, signal);
    const cover = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error('Не удалось создать обложку.'))),
        'image/jpeg',
        0.85,
      ),
    );
    canvas.width = canvas.height = 0;
    return { format, count: source.count, cover };
  } finally {
    await source.close();
  }
}
export async function fingerprint(blob: Blob, signal?: AbortSignal) {
  const h = sha256.create();
  for (let offset = 0; offset < blob.size; offset += 4 * 1024 * 1024) {
    if (signal?.aborted) throw new DOMException('Отменено', 'AbortError');
    h.update(new Uint8Array(await blob.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer()));
  }
  return Array.from(h.digest())
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
