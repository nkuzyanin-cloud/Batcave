import { useCallback, useEffect, useRef, useState, lazy } from 'react';
import {
  BookOpen,
  Library,
  UserRound,
  Settings as SettingsIcon,
  Search,
  Plus,
  ArrowLeft,
  ArrowUpRight,
  FolderPlus,
  ShieldCheck,
  Star,
  Award,
  Clock,
} from 'lucide-react';
import {
  type Comic,
  type Settings,
  defaultSettings,
  stats,
  status,
  percent,
  blankComic,
  errorMessage,
} from './models';
import { initialize, allComics, getSettings, saveSettings } from './storage/db';
import { Bat, Card, Cover, Progress, Empty } from './components/ui';
const Editor = lazy(() => import('./components/Editor').then((m) => ({ default: m.Editor })));
const Importer = lazy(() => import('./components/Importer').then((m) => ({ default: m.Importer })));
const SettingsPanel = lazy(() =>
  import('./components/Settings').then((m) => ({ default: m.SettingsPanel })),
);
const Reader = lazy(() => import('./reader/Reader').then((m) => ({ default: m.Reader })));
const filters = [
  ['all', 'Все'],
  ['reading', 'Читаю'],
  ['new', 'Не начато'],
  ['done', 'Прочитано'],
] as const;
type Tab = 'library' | 'collection' | 'profile' | 'settings' | 'reader';
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  return {
    tab: (['library', 'collection', 'profile', 'settings', 'reader'].includes(parts[0])
      ? parts[0]
      : 'library') as Tab,
    id: parts[1],
  };
}
export default function App() {
  const [comics, setComics] = useState<Comic[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(route);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [paperFilter, setPaperFilter] = useState('all');
  const [editing, setEditing] = useState<Comic>();
  const [importing, setImporting] = useState<{ file: File; target?: Comic }>();
  const [offline, setOffline] = useState('Подготовка офлайн-режима…');
  const [update, setUpdate] = useState<ServiceWorkerRegistration>();
  const input = useRef<HTMLInputElement>(null);
  const attachTarget = useRef<Comic | undefined>(undefined);
  const refresh = useCallback(async () => {
    setComics(await allComics());
    setSettings(await getSettings());
  }, []);
  useEffect(() => {
    void initialize()
      .then(refresh)
      .then(() => setLoading(false))
      .catch((e) => {
        setError(errorMessage(e));
        setLoading(false);
      });
    const listener = () => {
      setCurrent(route());
      void refresh().catch((e) => setError(errorMessage(e)));
    };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, [refresh]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setOffline('Офлайн недоступен в этом браузере');
      return;
    }
    if (import.meta.env.DEV) {
      setOffline('Режим разработки · офлайн доступен в сборке');
      return;
    }
    let alive = true;
    void navigator.serviceWorker
      .register(new URL('./sw.js', document.baseURI), { scope: './' })
      .then((r) => {
        if (r.active) setOffline('Офлайн готов');
        if (r.waiting) setUpdate(r);
        r.addEventListener('updatefound', () => {
          const worker = r.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              if (navigator.serviceWorker.controller) setUpdate(r);
              else if (alive) setOffline('Офлайн готов');
            }
            if (worker.state === 'redundant' && alive)
              setOffline(
                'Не удалось подготовить офлайн. Подключитесь к сети и откройте приложение заново.',
              );
          });
        });
      })
      .catch(() => setOffline('Офлайн пока не готов. Откройте сайт при стабильном интернете.'));
    const ready = () => {
      if (alive) setOffline('Офлайн готов');
    };
    navigator.serviceWorker.addEventListener('controllerchange', ready);
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener('controllerchange', ready);
    };
  }, []);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () =>
      (document.documentElement.dataset.motion =
        settings.motion === 'system' ? (reduced.matches ? 'off' : 'full') : settings.motion);
    apply();
    reduced.addEventListener('change', apply);
    return () => reduced.removeEventListener('change', apply);
  }, [settings.motion]);
  function navigate(tab: Tab, id?: string) {
    location.hash = `/${tab}${id ? `/${id}` : ''}`;
    window.scrollTo({ top: 0 });
  }
  function setConfig(s: Settings) {
    setSettings(s);
    void saveSettings(s).catch((e) => setError(`Настройки не сохранены: ${errorMessage(e)}`));
  }
  function attach(target?: Comic) {
    attachTarget.current = target;
    input.current?.click();
  }
  function read(c: Comic) {
    setEditing(undefined);
    navigate('reader', c.id);
  }
  const s = stats(comics);
  const last = comics
    .filter((c) => c.digital && c.lastOpened > 0 && !c.completed)
    .sort((a, b) => b.lastOpened - a.lastOpened)[0];
  const visible = comics
    .filter(
      (c) =>
        `${c.title} ${c.series} ${c.authors}`
          .toLocaleLowerCase('ru')
          .includes(query.toLocaleLowerCase('ru')) &&
        (filter === 'all' || status(c) === filter) &&
        (current.tab !== 'collection' || paperFilter === 'all' || c.physical === paperFilter),
    )
    .sort((a, b) =>
      settings.sort === 'title'
        ? a.title.localeCompare(b.title, 'ru')
        : settings.sort === 'year'
          ? (b.year || 0) - (a.year || 0)
          : b.addedAt - a.addedAt,
    );
  const groups = settings.groupSeries
    ? Array.from(new Set(visible.map((c) => c.series || 'Без серии'))).map((name) => ({
        name,
        books: visible.filter((c) => (c.series || 'Без серии') === name),
      }))
    : [{ name: '', books: visible }];
  const reading = comics.find((c) => c.id === current.id);
  if (loading)
    return (
      <div className="boot">
        <Bat />
        <span className="spinner" />
        <p>Открываем архив…</p>
      </div>
    );
  if (current.tab === 'reader' && reading?.digital)
    return (
      <Reader
        comic={reading}
        settings={settings}
        onSettings={setConfig}
        onClose={() => {
          navigate('library');
          void refresh();
        }}
      />
    );
  const title = {
    library: 'Библиотека',
    collection: 'Коллекция',
    profile: 'Мой архив',
    settings: 'Настройки',
    reader: 'Библиотека',
  }[current.tab];
  return (
    <div className="app">
      <input
        ref={input}
        hidden
        type="file"
        data-testid="comic-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setImporting({ file, target: attachTarget.current });
          e.target.value = '';
        }}
      />
      <header className="app-header">
        <a href="#/library" className="brand" aria-label="BATCAVE — библиотека">
          <Bat />
          <span>
            BATCAVE<small>ЛИЧНЫЙ АРХИВ / DC</small>
          </span>
        </a>
        <div className="header-controls">
          <span className="online-dot" title={offline} />
          <button
            className="icon-button"
            aria-label="Открыть настройки"
            onClick={() => navigate('settings')}
          >
            <SettingsIcon size={21} />
          </button>
        </div>
      </header>
      <main>
        {current.tab === 'settings' ? (
          <div className="page-heading">
            <button className="icon-button" aria-label="Назад" onClick={() => navigate('library')}>
              <ArrowLeft />
            </button>
            <h1>{title}</h1>
          </div>
        ) : (
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {current.tab === 'collection'
                  ? 'ИЗДАНИЯ НА ПОЛКЕ'
                  : current.tab === 'profile'
                    ? 'ТВОЯ ИСТОРИЯ ЧТЕНИЯ'
                    : 'ДОБРО ПОЖАЛОВАТЬ В АРХИВ'}
              </span>
              <h1>{title}</h1>
            </div>
            {(current.tab === 'library' || current.tab === 'collection') && (
              <button
                className="add-small"
                aria-label={
                  current.tab === 'collection' ? 'Добавить бумажный комикс' : 'Добавить комикс'
                }
                onClick={() => (current.tab === 'collection' ? setEditing(blankComic()) : attach())}
              >
                <Plus size={20} />
                <span>Добавить</span>
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button aria-label="Скрыть ошибку" onClick={() => setError('')}>
              ×
            </button>
          </div>
        )}
        {update && (
          <div className="update-banner">
            <span>Новая версия BATCAVE готова</span>
            <button
              onClick={() => {
                const reload = () => location.reload();
                navigator.serviceWorker.addEventListener('controllerchange', reload, {
                  once: true,
                });
                update.waiting?.postMessage('ACTIVATE');
              }}
            >
              Обновить
            </button>
          </div>
        )}
        {(current.tab === 'library' ||
          current.tab === 'collection' ||
          current.tab === 'reader') && (
          <>
            {current.tab === 'library' &&
              (last ? (
                <button className="continue-card" onClick={() => read(last)}>
                  <Cover comic={last} />
                  <div>
                    <span className="eyebrow">ПРОДОЛЖИТЬ ЧТЕНИЕ</span>
                    <h2>{last.title.replace(/^Бэтмен\. /, '')}</h2>
                    <p>
                      Страница {last.page + 1} из {last.pageCount}
                    </p>
                    <Progress value={percent(last)} />
                    <span className="continue-action">
                      Продолжить <ArrowUpRight size={18} />
                    </span>
                  </div>
                </button>
              ) : (
                <div className="archive-intro">
                  <div className="archive-orbit">
                    <Bat />
                  </div>
                  <div>
                    <span className="eyebrow">ТВОЯ ПЕЩЕРА. ТВОИ ИСТОРИИ.</span>
                    <h2>
                      У каждого героя
                      <br />
                      есть свой архив.
                    </h2>
                    <p>
                      Добавь первый файл —<br />и продолжи с любой страницы.
                    </p>
                    <button onClick={() => attach()} className="intro-action">
                      Добавить комикс <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <span className="archive-number">DC / 01</span>
                </div>
              ))}
            {current.tab === 'collection' && (
              <div className="collection-summary">
                <div>
                  <strong>{s.paper}</strong>
                  <span>книг на полке</span>
                </div>
                <p>
                  «Суд Сов» и «Город Сов» — одна книга. Остальные издания отмечены без
                  предположений.
                </p>
              </div>
            )}
            <label className="search">
              <Search size={19} />
              <input
                placeholder="Название, серия или автор"
                aria-label="Поиск комиксов"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button aria-label="Очистить поиск" onClick={() => setQuery('')}>
                  ×
                </button>
              )}
            </label>
            <div className="filters">
              {filters.map(([value, label]) => (
                <button
                  key={value}
                  className={filter === value ? 'active' : ''}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="catalog-tools">
              <span>{visible.length} произведений</span>
              <select
                aria-label="Сортировка"
                value={settings.sort}
                onChange={(e) =>
                  setConfig({ ...settings, sort: e.target.value as Settings['sort'] })
                }
              >
                <option value="added">Сначала новые</option>
                <option value="title">По названию</option>
                <option value="year">По году выхода</option>
              </select>
            </div>
            <div className="catalog-options">
              <label>
                <input
                  type="checkbox"
                  checked={settings.groupSeries}
                  onChange={(e) => setConfig({ ...settings, groupSeries: e.target.checked })}
                />
                По сериям
              </label>
              {current.tab === 'collection' && (
                <select
                  aria-label="Наличие в бумаге"
                  value={paperFilter}
                  onChange={(e) => setPaperFilter(e.target.value)}
                >
                  <option value="all">Все издания</option>
                  <option value="yes">Есть в бумаге</option>
                  <option value="unknown">Не проверено</option>
                  <option value="no">Нет в бумаге</option>
                </select>
              )}
            </div>
            {!visible.length ? (
              <Empty title="Здесь пока тихо">
                <p>Попробуйте другой фильтр или добавьте комикс.</p>
              </Empty>
            ) : (
              groups.map((group) => (
                <section className="catalog-group" key={group.name}>
                  {group.name && (
                    <h2>
                      {group.name}
                      <small>{group.books.length}</small>
                    </h2>
                  )}
                  <div className="comic-grid">
                    {group.books.map((c) => (
                      <Card
                        key={c.id}
                        comic={c}
                        photo={current.tab === 'collection'}
                        onClick={() => setEditing(c)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
            <button className="add-comic" onClick={() => attach()}>
              <FolderPlus size={21} />
              Добавить комикс<span>PDF · CBZ · изображения</span>
            </button>
            <p className="local-footer">
              <ShieldCheck size={13} />
              Файлы остаются только на этом устройстве
            </p>
          </>
        )}
        {current.tab === 'profile' && (
          <>
            <div className="profile-hero">
              <Bat />
              <div>
                <span className="eyebrow">BATCAVE / ЛИЧНЫЙ АРХИВ</span>
                <h2>
                  Истории, которые
                  <br />
                  остаются с тобой.
                </h2>
                <p>Каждая страница — часть коллекции.</p>
              </div>
            </div>
            <div className="stats-grid">
              {[
                [s.total, 'Произведений'],
                [s.digital, 'Цифровых файлов'],
                [s.done, 'Прочитано'],
                [s.reading, 'В процессе'],
                [s.pages, 'Открыто страниц'],
                [s.paper, 'Книг на полке'],
              ].map(([n, label]) => (
                <div className="stat" key={label}>
                  <strong>{n}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <section className="panel">
              <div className="section-label">
                <Clock size={18} />
                <h2>Время чтения</h2>
              </div>
              <strong className="reading-time">
                {Math.floor(s.seconds / 3600)} ч {Math.floor(s.seconds / 60) % 60} мин
              </strong>
              <p className="muted">
                Оценка времени в открытой читалке. Пауза при сворачивании и после 2 минут без
                действий. Открытая страница не гарантирует, что она прочитана.
              </p>
            </section>
            <section className="panel collection-progress">
              <h2>Прочитано в архиве</h2>
              <div>
                <strong>
                  {s.done} <small>/ {s.total}</small>
                </strong>
                <span>{s.total ? Math.round((s.done / s.total) * 100) : 0}%</span>
              </div>
              <Progress value={s.total ? (s.done / s.total) * 100 : 0} />
            </section>
            <section className="panel">
              <div className="section-label">
                <Award size={19} />
                <h2>Маленькие достижения</h2>
              </div>
              <div className="achievements">
                {[
                  [s.done > 0, 'Первая история', 'Прочитать один комикс'],
                  [s.pages >= 100, 'Сто страниц', 'Открыть 100 разных страниц'],
                  [s.digital >= 5, 'Цифровой архив', 'Добавить 5 комиксов'],
                ].map(([done, name, description]) => (
                  <div className={done ? 'unlocked' : ''} key={String(name)}>
                    <Award size={24} />
                    <span>
                      <strong>{name}</strong>
                      <small>{description}</small>
                    </span>
                    <span>{done ? '✓' : '—'}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="section-label">
                <Star size={18} />
                <h2>Личные оценки</h2>
              </div>
              {comics.some((c) => c.rating > 0) ? (
                <div className="ratings-list">
                  {comics
                    .filter((c) => c.rating > 0)
                    .sort((a, b) => b.rating - a.rating)
                    .map((c) => (
                      <button key={c.id} onClick={() => setEditing(c)}>
                        <span>{c.title}</span>
                        <strong>{'★'.repeat(c.rating)}</strong>
                      </button>
                    ))}
                </div>
              ) : (
                <p className="muted">
                  Оцените комикс в его карточке. Здесь появятся ваши впечатления.
                </p>
              )}
            </section>
          </>
        )}
        {current.tab === 'settings' && (
          <SettingsPanel
            settings={settings}
            onChange={setConfig}
            comics={comics}
            onRefresh={refresh}
            offline={offline}
          />
        )}
      </main>
      <nav className="bottom-nav" aria-label="Разделы">
        {(
          [
            ['library', BookOpen, 'Библиотека'],
            ['collection', Library, 'Коллекция'],
            ['profile', UserRound, 'Профиль'],
          ] as const
        ).map(([tab, Icon, label]) => (
          <button
            key={tab}
            className={current.tab === tab ? 'active' : ''}
            aria-current={current.tab === tab ? 'page' : undefined}
            onClick={() => navigate(tab)}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {editing && (
        <Editor
          key={editing.id}
          comic={editing}
          onClose={() => setEditing(undefined)}
          onSaved={refresh}
          onRead={read}
          onAttach={(c) => {
            setEditing(undefined);
            attach(c);
          }}
        />
      )}
      {importing && (
        <Importer
          file={importing.file}
          target={importing.target}
          onClose={() => setImporting(undefined)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
