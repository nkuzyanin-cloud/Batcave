export type Format = 'pdf' | 'cbz' | 'image';
export type Physical = 'yes' | 'no' | 'unknown';
export interface Digital {
  assetId: string;
  format: Format;
  name: string;
  size: number;
  fingerprint: string;
}
export interface Comic {
  id: string;
  title: string;
  series: string;
  authors: string;
  year: number | null;
  yearEnd?: number;
  addedAt: number;
  updatedAt: number;
  physical: Physical;
  physicalGroup?: string;
  edition: string;
  publisher: string;
  editionYear: number | null;
  note: string;
  rating: number;
  completed: boolean;
  page: number;
  pageCount: number;
  visited: number[];
  seconds: number;
  lastOpened: number;
  digital?: Digital;
  coverId?: string;
  photoId?: string;
  tone: string;
}
export interface Asset {
  id: string;
  blob: Blob;
}
export interface Settings {
  mode: 'single' | 'vertical';
  direction: 'ltr' | 'rtl';
  motion: 'system' | 'full' | 'fast' | 'off';
  readerTheme: 'black' | 'gray' | 'light';
  doubleTap: boolean;
  showPage: boolean;
  groupSeries: boolean;
  sort: 'added' | 'title' | 'year';
}
export const defaultSettings: Settings = {
  mode: 'single',
  direction: 'ltr',
  motion: 'system',
  readerTheme: 'black',
  doubleTap: true,
  showPage: true,
  groupSeries: false,
  sort: 'added',
};
export const status = (c: Comic) => (c.completed ? 'done' : c.lastOpened > 0 ? 'reading' : 'new');
export const percent = (c: Comic) =>
  c.completed ? 100 : c.pageCount ? Math.round((c.visited.length / c.pageCount) * 100) : 0;
export function blankComic(title = 'Новый комикс'): Comic {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title,
    series: 'DC',
    authors: '',
    year: null,
    addedAt: now,
    updatedAt: now,
    physical: 'unknown',
    edition: '',
    publisher: '',
    editionYear: null,
    note: '',
    rating: 0,
    completed: false,
    page: 0,
    pageCount: 0,
    visited: [],
    seconds: 0,
    lastOpened: 0,
    tone: '#79a9be',
  };
}
export function stats(comics: Comic[]) {
  return {
    total: comics.length,
    digital: comics.filter((c) => c.digital).length,
    done: comics.filter((c) => c.completed).length,
    reading: comics.filter((c) => status(c) === 'reading').length,
    pages: comics.reduce((n, c) => n + c.visited.length, 0),
    paper: new Set(comics.filter((c) => c.physical === 'yes').map((c) => c.physicalGroup || c.id))
      .size,
    seconds: comics.reduce((n, c) => n + c.seconds, 0),
  };
}
export function errorMessage(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  if (/password|encrypted/i.test(msg))
    return 'Файл защищён паролем. Добавьте незашифрованную копию.';
  if (/End of central|Bad format|Invalid signature|invalid.*zip|CRC|checksum/i.test(msg))
    return 'Архив повреждён или не соответствует формату ZIP / CBZ. Выберите другую копию файла.';
  if (/Invalid PDF|Missing PDF/i.test(msg))
    return 'PDF повреждён или не содержит корректного документа.';
  if (/quota|disk|space/i.test(msg))
    return 'Недостаточно места на устройстве. Освободите место или удалите цифровой файл в настройках.';
  if (/memory|allocation|out of/i.test(msg))
    return 'Не хватает памяти для этого файла. Попробуйте меньший файл и закройте другие приложения.';
  return msg || 'Не удалось выполнить действие.';
}
export const bytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`;
