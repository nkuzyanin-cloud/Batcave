import { useEffect, useRef, useState } from 'react';
import { type Comic, blankComic, errorMessage, bytes } from '../models';
import { inspectFile, fingerprint, type ImportPreview } from '../reader/source';
import { saveComic, allComics } from '../storage/db';
import { Modal } from './ui';
import { Upload, Check, FileText } from 'lucide-react';
export function Importer({
  file,
  target,
  onClose,
  onSaved,
}: {
  file: File;
  target?: Comic;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<ImportPreview>();
  const [c, set] = useState(target ? { ...target } : blankComic(file.name.replace(/\.[^.]+$/, '')));
  const [url, setUrl] = useState('');
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('Проверка файла и первой страницы…');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    let u = '';
    void (async () => {
      try {
        const p = await inspectFile(file, file.name, controller.signal);
        if (!active.current) return;
        setMessage('Проверка дубликатов…');
        const h = await fingerprint(file, controller.signal);
        const existing = (await allComics()).find(
          (b) => b.digital?.fingerprint === h && b.id !== target?.id,
        );
        if (existing) throw Error(`Этот файл уже в библиотеке: «${existing.title}».`);
        if (!active.current) return;
        u = URL.createObjectURL(p.cover);
        setUrl(u);
        setPreview(p);
        setHash(h);
        setBusy(false);
      } catch (e) {
        if (active.current) {
          setError(errorMessage(e));
          setBusy(false);
        }
      }
    })();
    return () => {
      active.current = false;
      controller.abort();
      if (u) URL.revokeObjectURL(u);
    };
  }, [file, target]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setBusy(true);
    setMessage('Сохранение на устройстве…');
    setError('');
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (
        estimate?.quota &&
        estimate.usage !== undefined &&
        estimate.quota - estimate.usage < file.size * 1.15
      )
        throw Error('Недостаточно свободного места для файла.');
      const fileId = crypto.randomUUID(),
        coverId = crypto.randomUUID();
      const same = target?.digital?.fingerprint === hash;
      await saveComic(
        {
          ...c,
          title: c.title.trim(),
          pageCount: preview.count,
          digital: {
            assetId: fileId,
            name: file.name,
            size: file.size,
            format: preview.format,
            fingerprint: hash,
          },
          coverId,
          ...(!same ? { page: 0, visited: [], seconds: 0, lastOpened: 0 } : {}),
          completed: c.completed,
        },
        [
          { id: fileId, blob: file },
          { id: coverId, blob: preview.cover },
        ],
        target ? [target.digital?.assetId, target.coverId].filter((x): x is string => !!x) : [],
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal title="Добавить комикс" onClose={onClose}>
      <div className="import-summary">
        {url ? <img src={url} alt="Первая страница" /> : <FileText size={40} />}
        <div>
          <span className="eyebrow">ЛОКАЛЬНЫЙ ИМПОРТ</span>
          <h3>{file.name}</h3>
          <p>
            {bytes(file.size)}
            {preview ? ` · ${preview.count} стр. · ${preview.format.toUpperCase()}` : ''}
          </p>
        </div>
      </div>
      {busy && (
        <p className="loading">
          <span className="spinner" />
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <form className="form" onSubmit={submit}>
          <p className="success">
            <Check size={16} />
            Первая страница прочитана, структура проверена
          </p>
          {!target && (
            <>
              <label>
                Название
                <input
                  required
                  maxLength={300}
                  value={c.title}
                  onChange={(e) => set({ ...c, title: e.target.value })}
                />
              </label>
              <label>
                Серия
                <input
                  maxLength={300}
                  value={c.series}
                  onChange={(e) => set({ ...c, series: e.target.value })}
                />
              </label>
              <label>
                Авторы
                <input
                  maxLength={1000}
                  value={c.authors}
                  onChange={(e) => set({ ...c, authors: e.target.value })}
                />
              </label>
              <label>
                Год
                <input
                  type="number"
                  min="1800"
                  max="2200"
                  value={c.year ?? ''}
                  onChange={(e) =>
                    set({ ...c, year: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </label>
            </>
          )}
          <p className="muted">
            Файл останется на этом устройстве. Ничего не отправляется в интернет. Все страницы
            проверяются по мере чтения.
          </p>
          <button type="submit" className="primary" disabled={busy}>
            <Upload size={18} />
            {busy ? 'Сохранение…' : target ? 'Прикрепить к комиксу' : 'Сохранить в библиотеку'}
          </button>
        </form>
      )}
    </Modal>
  );
}
