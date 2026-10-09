import { useEffect, useState } from 'react';
import { Download, Upload, HardDrive, ShieldCheck, Trash2, RotateCcw, Info } from 'lucide-react';
import { type Comic, type Settings, bytes, errorMessage } from '../models';
import { usage, deleteDigital, resetProgress } from '../storage/db';
import {
  exportMetadata,
  exportFull,
  prepareRestore,
  restore,
  download,
  type PreparedBackup,
} from '../storage/backup';
import { ReaderPreferences } from '../reader/Reader';
export function SettingsPanel({
  settings,
  onChange,
  comics,
  onRefresh,
  offline,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  comics: Comic[];
  onRefresh: () => Promise<void>;
  offline: string;
}) {
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof usage>>>();
  const [busy, setBusy] = useState('');
  const [generated, setGenerated] = useState<{ blob: Blob; name: string }>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [prepared, setPrepared] = useState<PreparedBackup>();
  const [policy, setPolicy] = useState<'keep' | 'replace'>('keep');
  const [replaceSettings, setReplaceSettings] = useState(false);
  const [confirm, setConfirm] = useState<'reset' | Comic | null>(null);
  const refresh = async () => {
    await onRefresh();
    setStorage(await usage());
  };
  useEffect(() => {
    void usage()
      .then(setStorage)
      .catch((e) => setError(errorMessage(e)));
  }, [comics]);
  async function backup(full: boolean) {
    setGenerated(undefined);
    setBusy('Подготовка копии…');
    setError('');
    setNotice('');
    try {
      const blob = full ? await exportFull(setBusy) : await exportMetadata();
      const name = `BATCAVE-${new Date().toISOString().slice(0, 10)}.${full ? 'zip' : 'json'}`;
      setGenerated({ blob, name });
      download(blob, name);
      setNotice(
        full
          ? 'Полная копия подготовлена. Сохраните скачанный архив в «Файлы».'
          : 'JSON подготовлен. Он содержит коллекцию, настройки и прогресс, без оригиналов и фотографий.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  async function load(file?: File) {
    if (!file) return;
    setBusy('Проверка резервной копии…');
    setError('');
    setNotice('');
    setPrepared(undefined);
    try {
      setPrepared(await prepareRestore(file, setBusy));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  async function apply() {
    if (!prepared) return;
    setBusy('Восстановление библиотеки…');
    setError('');
    try {
      const result = await restore(prepared, policy, replaceSettings);
      setPrepared(undefined);
      await refresh();
      setNotice(
        `Восстановлено: ${result.imported}. Сохранено существующих записей: ${result.skipped}. Возвращено файлов: ${result.hydrated}.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  async function remove() {
    if (!confirm) return;
    setBusy('Сохранение…');
    setError('');
    try {
      if (confirm === 'reset') await resetProgress();
      else await deleteDigital(confirm);
      setConfirm(null);
      await refresh();
      setNotice('Готово.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="section-label">
          <ShieldCheck size={19} />
          <h2>Чтение</h2>
        </div>
        <ReaderPreferences settings={settings} onChange={onChange} />
      </section>
      <section className="panel">
        <div className="section-label">
          <Download size={19} />
          <h2>Резервные копии</h2>
        </div>
        <p className="muted">
          iOS может удалить локальные данные при нехватке места или очистке Safari. Установка на
          главный экран не гарантирует их сохранность. Храните копии в «Файлах» или на компьютере.
        </p>
        <div className="stack">
          <button className="secondary" disabled={!!busy} onClick={() => void backup(false)}>
            <Download size={18} />
            Экспорт JSON
          </button>
          <button className="primary" disabled={!!busy} onClick={() => void backup(true)}>
            <Download size={18} />
            Полный архив с файлами
          </button>
          <small>
            Полный экспорт — до 300 МБ. Для большей библиотеки сохраняйте JSON и оригиналы отдельно.
          </small>
          <label className={`secondary file-button ${busy ? 'disabled' : ''}`}>
            <Upload size={18} />
            Восстановить из JSON / ZIP
            <input
              type="file"
              accept=".json,.zip,application/json,application/zip"
              disabled={!!busy}
              onChange={(e) => {
                void load(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {generated && (
          <div className="restore-box">
            <p>Копия готова: {generated.name}</p>
            <button className="secondary" onClick={() => download(generated.blob, generated.name)}>
              <Download size={18} />
              Сохранить копию
            </button>
            <small>
              Если Safari не начал скачивание автоматически, нажмите эту кнопку и сохраните файл в
              «Файлы».
            </small>
          </div>
        )}
        {prepared && (
          <div className="restore-box">
            <h3>Копия проверена</h3>
            <p>
              {prepared.data.comics.length} записей · {prepared.data.assets.length} файлов ·
              совпадений: {prepared.conflicts}
            </p>
            <label>
              При совпадении
              <select value={policy} onChange={(e) => setPolicy(e.target.value as typeof policy)}>
                <option value="keep">Сохранить мои текущие данные</option>
                <option value="replace">Заменить данными из копии</option>
              </select>
            </label>
            <label className="switch-label">
              <span>Восстановить настройки</span>
              <input
                type="checkbox"
                checked={replaceSettings}
                onChange={(e) => setReplaceSettings(e.target.checked)}
              />
            </label>
            <p className="muted">
              JSON не возвращает оригиналы. В полной копии каждый файл проверяется по SHA-256.
              Замена затрагивает совпадающие записи, остальные остаются.
            </p>
            <div className="form-row">
              <button onClick={() => setPrepared(undefined)}>Отмена</button>
              <button className="primary" disabled={!!busy} onClick={() => void apply()}>
                Восстановить
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="section-label">
          <HardDrive size={19} />
          <h2>На устройстве</h2>
        </div>
        <div className="storage-number">
          {storage ? bytes(storage.local) : '…'}
          <small>Оригиналы, обложки и фотографии</small>
        </div>
        {storage?.estimate?.quota && (
          <p className="muted">
            Свободно в хранилище браузера: примерно{' '}
            {bytes(Math.max(0, storage.estimate.quota - (storage.estimate.usage || 0)))}. Это не
            свободное место на всём iPhone.
          </p>
        )}
        <button
          className="secondary"
          disabled={!!busy}
          onClick={() => {
            void (async () => {
              try {
                const persisted = await navigator.storage?.persist?.();
                setNotice(
                  persisted
                    ? 'Браузер разрешил устойчивое хранение. Резервные копии всё равно необходимы.'
                    : 'Браузер не предоставил устойчивое хранение. Используйте резервные копии.',
                );
              } catch (e) {
                setError(errorMessage(e));
              }
            })();
          }}
        >
          <ShieldCheck size={18} />
          Запросить сохранение данных
        </button>
        <div className="file-list">
          {comics
            .filter((c) => c.digital)
            .map((c) => (
              <div key={c.id}>
                <span>
                  {c.title}
                  <small>{bytes(c.digital!.size)}</small>
                </span>
                <button
                  className="icon-button"
                  aria-label={`Удалить файл ${c.title}`}
                  disabled={!!busy}
                  onClick={() => setConfirm(c)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
        </div>
        <button className="danger secondary" disabled={!!busy} onClick={() => setConfirm('reset')}>
          <RotateCcw size={18} />
          Сбросить прогресс чтения
        </button>
        {confirm && (
          <div className="confirm-box">
            <p>
              {confirm === 'reset'
                ? 'Сбросить страницы, статусы «Прочитан» и время чтения всех комиксов? Файлы и коллекция останутся.'
                : `Удалить оригинальный файл «${confirm.title}»? Карточка и прогресс останутся.`}
            </p>
            <div>
              <button onClick={() => setConfirm(null)}>Отмена</button>
              <button className="danger" disabled={!!busy} onClick={() => void remove()}>
                Подтвердить
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="section-label">
          <Info size={19} />
          <h2>BATCAVE / 1.0.0</h2>
        </div>
        <p>Личный архив комиксов DC</p>
        <p className="muted">
          PDF · CBZ · JPG · PNG · WebP
          <br />
          CBR / RAR не поддерживается. Лимит импорта — 600 МБ; страницы архива — до 32 МБ.
        </p>
        <p className="connection-state">{offline}</p>
        <p className="muted">
          На iPhone: откройте сайт в Safari → «Поделиться» → «На экран Домой». Дождитесь надписи
          «Офлайн готов» перед отключением сети.
        </p>
        <p className="muted">
          Файлы и коллекция хранятся только на устройстве. Приложение не связано с DC и не содержит
          коммерческих комиксов.
        </p>
      </section>
      {busy && (
        <div className="task-toast" role="status">
          <span className="spinner" />
          {busy}
        </div>
      )}
      {error && (
        <p className="error bottom-notice" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice bottom-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
