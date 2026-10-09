import { useState } from 'react';
import { Camera, Trash2, BookOpen, Upload, Star } from 'lucide-react';
import { type Comic, type Asset, percent, errorMessage } from '../models';
import { saveComic, deleteComic, deleteDigital } from '../storage/db';
import { imageToCanvas, detectFormat } from '../reader/source';
import { Modal, Cover, Progress } from './ui';
export function Editor({
  comic,
  onClose,
  onSaved,
  onRead,
  onAttach,
}: {
  comic: Comic;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onRead: (c: Comic) => void;
  onAttach: (c: Comic) => void;
}) {
  const [c, set] = useState({ ...comic });
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'file' | 'record' | null>(null);
  const change = <K extends keyof Comic>(key: K, value: Comic[K]) =>
    set((c) => ({ ...c, [key]: value }));
  async function photo(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if ((await detectFormat(file, file.name)) !== 'image')
        throw Error('Для фотографии выберите JPG, PNG или WebP.');
      const canvas = document.createElement('canvas');
      await imageToCanvas(file, canvas, 1000);
      const blob = await new Promise<Blob>((r, j) =>
        canvas.toBlob(
          (b) => (b ? r(b) : j(Error('Не удалось сохранить фото.'))),
          'image/jpeg',
          0.88,
        ),
      );
      canvas.width = canvas.height = 0;
      const asset = { id: crypto.randomUUID(), blob };
      setAssets([asset]);
      change('photoId', asset.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveComic(
        { ...c, title: c.title.trim() },
        assets,
        comic.photoId && c.photoId !== comic.photoId ? [comic.photoId] : [],
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError('');
    try {
      if (confirm === 'file') await deleteDigital(comic);
      else await deleteComic(comic);
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal title="Карточка комикса" onClose={onClose}>
      <div className="detail-top">
        <Cover comic={c} />
        <div>
          <span className="eyebrow">ЛИЧНЫЙ АРХИВ</span>
          <h2>{c.title}</h2>
          <p>
            {c.year}
            {c.yearEnd ? `–${c.yearEnd}` : ''} · {c.series}
          </p>
          <Progress value={percent(c)} />
          <p>
            {c.digital
              ? `${c.page + 1} / ${c.pageCount} стр. · ${percent(c)}%`
              : 'Нет цифровой копии'}
          </p>
        </div>
      </div>
      <div className="detail-actions">
        {comic.digital ? (
          <button className="primary" onClick={() => onRead(comic)}>
            <BookOpen size={18} />
            Читать
          </button>
        ) : (
          <button className="primary" onClick={() => onAttach(comic)}>
            <Upload size={18} />
            Добавить файл
          </button>
        )}
      </div>
      <form onSubmit={submit} className="form">
        <label>
          Название
          <input
            required
            maxLength={300}
            value={c.title}
            onChange={(e) => change('title', e.target.value)}
          />
        </label>
        <label>
          Серия
          <input
            maxLength={300}
            value={c.series}
            onChange={(e) => change('series', e.target.value)}
          />
        </label>
        <label>
          Авторы
          <input
            maxLength={1000}
            value={c.authors}
            onChange={(e) => change('authors', e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Год произведения
            <input
              type="number"
              min="1800"
              max="2200"
              value={c.year ?? ''}
              onChange={(e) => change('year', e.target.value ? Number(e.target.value) : null)}
            />
          </label>
          <label>
            Бумажная книга
            <select
              value={c.physical}
              onChange={(e) => change('physical', e.target.value as Comic['physical'])}
            >
              <option value="unknown">Не проверено</option>
              <option value="yes">Есть в бумаге</option>
              <option value="no">Нет в бумаге</option>
            </select>
          </label>
        </div>
        <label>
          Издание
          <input
            maxLength={500}
            value={c.edition}
            onChange={(e) => change('edition', e.target.value)}
            placeholder="Например, объединённое издание"
          />
        </label>
        <label>
          Общий экземпляр
          <select
            value={c.physicalGroup || ''}
            onChange={(e) => change('physicalGroup', e.target.value || undefined)}
          >
            <option value="">Отдельная книга</option>
            <option value="owls-combined">Суд Сов + Город Сов</option>
            {c.physicalGroup && c.physicalGroup !== 'owls-combined' && (
              <option value={c.physicalGroup}>{c.physicalGroup}</option>
            )}
          </select>
          <small>Произведения в одном экземпляре считаются одной бумажной книгой.</small>
        </label>
        <div className="form-row">
          <label>
            Издательство
            <input
              maxLength={300}
              value={c.publisher}
              onChange={(e) => change('publisher', e.target.value)}
            />
          </label>
          <label>
            Год издания
            <input
              type="number"
              min="1800"
              max="2200"
              value={c.editionYear ?? ''}
              onChange={(e) =>
                change('editionYear', e.target.value ? Number(e.target.value) : null)
              }
            />
          </label>
        </div>
        <label className="switch-label">
          <span>Прочитан</span>
          <input
            type="checkbox"
            checked={c.completed}
            onChange={(e) => change('completed', e.target.checked)}
          />
        </label>
        <label>
          Личная оценка
          <div className="rating" role="group" aria-label="Оценка">
            <button
              type="button"
              className={c.rating === 0 ? 'selected' : ''}
              onClick={() => change('rating', 0)}
            >
              Без
            </button>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                aria-label={`Оценка ${n}`}
                aria-pressed={c.rating === n}
                className={c.rating >= n ? 'selected' : ''}
                onClick={() => change('rating', n)}
              >
                <Star size={20} />
              </button>
            ))}
          </div>
        </label>
        <label>
          Заметка
          <textarea
            maxLength={10000}
            value={c.note}
            onChange={(e) => change('note', e.target.value)}
            rows={3}
            placeholder="Что запомнилось, особенности издания…"
          />
        </label>
        <label className="secondary file-button">
          <Camera size={18} />
          {c.photoId ? 'Заменить фото книги' : 'Прикрепить фото книги'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void photo(e.target.files?.[0])}
          />
        </label>
        {c.photoId && (
          <div className="photo-preview">
            {assets[0] ? <LocalPhoto blob={assets[0].blob} /> : <Cover comic={c} photo />}
            <button
              type="button"
              onClick={() => {
                change('photoId', undefined);
                setAssets([]);
              }}
            >
              Удалить фото
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Сохранение…' : 'Сохранить изменения'}
        </button>
        <div className="danger-actions">
          {comic.digital && (
            <button type="button" onClick={() => setConfirm('file')}>
              <Trash2 size={16} />
              Удалить цифровой файл
            </button>
          )}
          <button type="button" onClick={() => setConfirm('record')}>
            <Trash2 size={16} />
            Удалить запись из архива
          </button>
        </div>
        {confirm && (
          <div className="confirm-box">
            <p>
              {confirm === 'file'
                ? 'Удалить оригинальный файл? Карточка, обложка и прогресс останутся.'
                : 'Удалить комикс, файл, фотографию и прогресс? Это действие нельзя отменить.'}
            </p>
            <div>
              <button type="button" onClick={() => setConfirm(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                Удалить
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
import { useEffect } from 'react';
function LocalPhoto({ blob }: { blob: Blob }) {
  const [url, set] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    set(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return <img src={url} alt="Фотография книги" />;
}
