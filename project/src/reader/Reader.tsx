import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Minus,
  Plus,
  Maximize,
  ZoomOut,
} from 'lucide-react';
import { type Comic, type Settings, errorMessage } from '../models';
import { getAsset, updateProgress } from '../storage/db';
import { openSource, type PageSource } from './source';
import { Modal } from '../components/ui';
export function Reader({
  comic,
  settings,
  onSettings,
  onClose,
}: {
  comic: Comic;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<PageSource>();
  const [error, setError] = useState('');
  const [page, setPage] = useState(comic.page);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [visible, setVisible] = useState(true);
  const [preferences, setPreferences] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const area = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const activity = useRef(Date.now());
  const saved = useRef<Promise<void>>(Promise.resolve());
  const persist = useCallback(
    (p: number, loaded: boolean, seconds = 0) => {
      saved.current = saved.current
        .then(() => updateProgress(comic.id, p, loaded, seconds))
        .catch((e) => setError(`Не удалось сохранить прогресс: ${errorMessage(e)}`));
      return saved.current;
    },
    [comic.id],
  );
  useEffect(() => {
    let cancelled = false;
    let opened: PageSource | undefined;
    void (async () => {
      try {
        const asset = comic.digital ? await getAsset(comic.digital.assetId) : undefined;
        if (!asset) throw Error('Цифровой файл отсутствует. Добавьте его заново из библиотеки.');
        opened = await openSource(asset.blob, comic.digital!.format);
        if (cancelled) {
          await opened.close();
          return;
        }
        setSource(opened);
        setPage(Math.min(comic.page, opened.count - 1));
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
      ready.current = false;
      void opened?.close().catch(() => {});
    };
  }, [comic.id, comic.digital?.assetId]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let last = Date.now();
    function flush() {
      const now = Date.now();
      const seconds = Math.min(6, (now - last) / 1000);
      last = now;
      if (!document.hidden && ready.current && !preferences && now - activity.current < 120000)
        void persist(pageRef.current, false, seconds);
    }
    const interval = setInterval(flush, 5000);
    const visibility = () => {
      last = Date.now();
    };
    const touch = () => {
      activity.current = Date.now();
    };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('pointerdown', touch);
    document.addEventListener('keydown', touch);
    document.addEventListener('pagehide', flush);
    return () => {
      flush();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerdown', touch);
      document.removeEventListener('keydown', touch);
      document.removeEventListener('pagehide', flush);
      document.body.style.overflow = previous;
    };
  }, [persist, preferences]);
  const go = useCallback(
    (p: number) => {
      if (!source) return;
      const next = Math.min(source.count - 1, Math.max(0, p));
      setPage(next);
      pageRef.current = next;
      setZoom(1);
      setPan({ x: 0, y: 0 });
      ready.current = false;
      void persist(next, false);
      activity.current = Date.now();
    },
    [source, persist],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (preferences) return;
      if (e.key === 'ArrowRight') go(pageRef.current + (settings.direction === 'ltr' ? 1 : -1));
      if (e.key === 'ArrowLeft') go(pageRef.current + (settings.direction === 'ltr' ? -1 : 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [go, settings.direction, onClose, preferences]);
  const loaded = useCallback(
    (p: number) => {
      if (p === pageRef.current) {
        ready.current = true;
        void persist(p, true);
      }
    },
    [persist],
  );
  const points = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    scale: 1,
    distance: 0,
    moved: false,
    pinch: false,
    time: 0,
  });
  const tap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(tapTimer.current), []);
  function bound(x: number, y: number, scale: number) {
    const w = area.current?.clientWidth || 400,
      h = area.current?.clientHeight || 600;
    const canvas = area.current?.querySelector('canvas');
    const maxX = Math.max(0, ((canvas?.offsetWidth || w) * scale - w) / 2);
    const maxY = Math.max(0, ((canvas?.offsetHeight || h) * scale - h) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }
  const distance = () => {
    const p = Array.from(points.current.values());
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  };
  function down(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.current.size === 1)
      gesture.current = {
        x: e.clientX,
        y: e.clientY,
        px: pan.x,
        py: pan.y,
        scale: zoom,
        distance: 0,
        moved: false,
        pinch: false,
        time: Date.now(),
      };
    if (points.current.size === 2) {
      gesture.current.distance = distance();
      gesture.current.scale = zoom;
      gesture.current.pinch = true;
      clearTimeout(tapTimer.current);
    }
  }
  function move(e: React.PointerEvent) {
    if (!points.current.has(e.pointerId)) return;
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (points.current.size === 2) {
      const z = Math.max(1, Math.min(4, (g.scale * distance()) / Math.max(1, g.distance)));
      setZoom(z);
      setPan(bound(pan.x, pan.y, z));
      g.moved = true;
    } else if (!g.pinch) {
      const dx = e.clientX - g.x,
        dy = e.clientY - g.y;
      if (Math.hypot(dx, dy) > 8) g.moved = true;
      if (zoom > 1) setPan(bound(g.px + dx, g.py + dy, zoom));
    }
  }
  function up(e: React.PointerEvent) {
    points.current.delete(e.pointerId);
    if (points.current.size) return;
    const g = gesture.current;
    if (g.pinch) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (zoom === 1 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      go(page + (dx < 0 ? 1 : -1) * (settings.direction === 'ltr' ? 1 : -1));
      return;
    }
    if (g.moved || Date.now() - g.time > 500) return;
    const now = Date.now();
    if (now - tap.current < 280 && settings.doubleTap) {
      clearTimeout(tapTimer.current);
      setZoom(zoom > 1 ? 1 : 2.5);
      setPan({ x: 0, y: 0 });
      tap.current = 0;
    } else {
      tap.current = now;
      tapTimer.current = setTimeout(() => setVisible((v) => !v), settings.doubleTap ? 280 : 0);
    }
  }
  const leave = async () => {
    await saved.current;
    onClose();
  };
  return (
    <div className={`reader theme-${settings.readerTheme}`} aria-label="Читалка">
      <header className={`reader-header ${visible ? '' : 'hidden-ui'}`}>
        <button
          className="icon-button"
          aria-label="Вернуться в библиотеку"
          onClick={() => void leave()}
        >
          <ArrowLeft />
        </button>
        <div>
          <span>{comic.title}</span>
          <small>{settings.mode === 'single' ? 'Одиночная страница' : 'Вертикальное чтение'}</small>
        </div>
        <button
          className="icon-button"
          aria-label="Настройки чтения"
          onClick={() => setPreferences(true)}
        >
          <Settings2 />
        </button>
      </header>
      {error ? (
        <div className="reader-error">
          <p role="alert">{error}</p>
          <button className="primary" onClick={() => void leave()}>
            В библиотеку
          </button>
        </div>
      ) : !source ? (
        <div className="reader-loading">
          <span className="spinner" />
          <p>Открытие комикса…</p>
        </div>
      ) : settings.mode === 'single' ? (
        <div
          ref={area}
          className="reader-stage"
          data-testid="reader-stage"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => points.current.clear()}
          onWheel={(e) => {
            if (e.ctrlKey) {
              setZoom((z) => Math.max(1, Math.min(4, z - e.deltaY * 0.005)));
            } else if (zoom > 1) setPan(bound(pan.x - e.deltaX, pan.y - e.deltaY, zoom));
          }}
        >
          <div
            className="page-transform"
            data-testid="page-transform"
            style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}
          >
            <RenderedPage
              key={page}
              source={source}
              index={page}
              onLoaded={loaded}
              onError={setError}
            />
          </div>
        </div>
      ) : (
        <VerticalReader
          source={source}
          page={page}
          onPage={(p) => {
            pageRef.current = p;
            setPage(p);
            void persist(p, false);
            activity.current = Date.now();
          }}
          onLoaded={loaded}
          onError={setError}
          onTap={() => setVisible((v) => !v)}
          doubleTap={settings.doubleTap}
        />
      )}
      {source && (
        <footer className={`reader-controls ${visible ? '' : 'hidden-ui'}`}>
          <input
            aria-label="Перейти к странице"
            type="range"
            min="0"
            max={source.count - 1}
            value={page}
            onChange={(e) => go(Number(e.target.value))}
          />
          <div className="reader-toolbar">
            <button
              className="icon-button"
              aria-label="Предыдущая страница"
              disabled={page === 0}
              onClick={() => go(page - 1)}
            >
              <ChevronLeft />
            </button>
            <span aria-live="polite">
              {settings.showPage
                ? `${page + 1} / ${source.count}`
                : `${Math.round(((page + 1) / source.count) * 100)}%`}
            </span>
            <button
              className="icon-button"
              aria-label="Следующая страница"
              disabled={page === source.count - 1}
              onClick={() => go(page + 1)}
            >
              <ChevronRight />
            </button>
            {settings.mode === 'single' && (
              <>
                <button
                  className="icon-button"
                  aria-label="Уменьшить масштаб"
                  onClick={() => {
                    setZoom((z) => Math.max(1, z - 0.5));
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  <Minus size={19} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Увеличить масштаб"
                  onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
                >
                  <Plus size={19} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Сбросить масштаб"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  <ZoomOut size={19} />
                </button>
              </>
            )}
            <button
              className="icon-button"
              aria-label="Полный экран"
              onClick={() => {
                const el = document.documentElement;
                if (document.fullscreenElement) void document.exitFullscreen?.();
                else if (el.requestFullscreen)
                  void el.requestFullscreen().catch(() => setVisible(false));
                else setVisible(false);
              }}
            >
              <Maximize size={18} />
            </button>
          </div>
        </footer>
      )}
      {preferences && (
        <Modal title="Настройки чтения" onClose={() => setPreferences(false)}>
          <ReaderPreferences
            settings={settings}
            onChange={(s) => {
              onSettings(s);
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          />
          <p className="muted">
            Свайп — перелистнуть. Два касания — масштаб. Два пальца — увеличение. Касание — скрыть
            интерфейс.
          </p>
        </Modal>
      )}
    </div>
  );
}
export function ReaderPreferences({
  settings: s,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  return (
    <div className="form">
      <label>
        Режим чтения
        <select
          value={s.mode}
          onChange={(e) => onChange({ ...s, mode: e.target.value as Settings['mode'] })}
        >
          <option value="single">Одиночные страницы</option>
          <option value="vertical">Вертикальная прокрутка</option>
        </select>
      </label>
      <label>
        Направление свайпов
        <select
          value={s.direction}
          onChange={(e) => onChange({ ...s, direction: e.target.value as Settings['direction'] })}
        >
          <option value="ltr">Слева направо</option>
          <option value="rtl">Справа налево</option>
        </select>
      </label>
      <label>
        Фон страницы
        <select
          value={s.readerTheme}
          onChange={(e) =>
            onChange({ ...s, readerTheme: e.target.value as Settings['readerTheme'] })
          }
        >
          <option value="black">Чёрный</option>
          <option value="gray">Графит</option>
          <option value="light">Светлый</option>
        </select>
      </label>
      <label>
        Анимации
        <select
          value={s.motion}
          onChange={(e) => onChange({ ...s, motion: e.target.value as Settings['motion'] })}
        >
          <option value="system">Как в системе</option>
          <option value="full">Плавные</option>
          <option value="fast">Быстрые</option>
          <option value="off">Выключены</option>
        </select>
      </label>
      <label className="switch-label">
        <span>Масштаб двойным касанием</span>
        <input
          type="checkbox"
          checked={s.doubleTap}
          onChange={(e) => onChange({ ...s, doubleTap: e.target.checked })}
        />
      </label>
      <label className="switch-label">
        <span>Номер страницы</span>
        <input
          type="checkbox"
          checked={s.showPage}
          onChange={(e) => onChange({ ...s, showPage: e.target.checked })}
        />
      </label>
    </div>
  );
}
function RenderedPage({
  source,
  index,
  onLoaded,
  onError,
  onRatio,
}: {
  source: PageSource;
  index: number;
  onLoaded: (p: number) => void;
  onError: (s: string) => void;
  onRatio?: (p: number, r: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const canvas = ref.current!;
    const abort = new AbortController();
    let alive = true;
    setBusy(true);
    void source
      .render(
        index,
        canvas,
        Math.min(2200, window.innerWidth * (window.devicePixelRatio || 1)),
        abort.signal,
      )
      .then(() => {
        if (alive) {
          setBusy(false);
          onRatio?.(index, canvas.height / canvas.width);
          onLoaded(index);
        }
      })
      .catch((e) => {
        if (alive && !abort.signal.aborted) onError(errorMessage(e));
      });
    return () => {
      alive = false;
      abort.abort();
      canvas.width = canvas.height = 0;
    };
  }, [source, index, onLoaded, onError, onRatio]);
  return (
    <>
      <canvas
        ref={ref}
        className="reader-canvas"
        aria-label={`Страница ${index + 1}`}
        data-page={index}
        style={{ opacity: busy ? 0 : 1 }}
      />
      {busy && <span className="page-spinner spinner" />}
    </>
  );
}
function VerticalReader({
  source,
  page,
  onPage,
  onLoaded,
  onError,
  onTap,
  doubleTap,
}: {
  source: PageSource;
  page: number;
  onPage: (p: number) => void;
  onLoaded: (p: number) => void;
  onError: (s: string) => void;
  onTap: () => void;
  doubleTap: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [width, setWidth] = useState(window.innerWidth);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const [zoom, setZoom] = useState(1);
  const scrollPage = useRef(page);
  const heights = Array.from(
    { length: source.count },
    (_, i) => Math.max(200, width * (ratios[i] || source.ratio)) + 14,
  );
  const offsets = [0];
  for (const h of heights) offsets.push(offsets[offsets.length - 1] + h);
  const offsetsRef = useRef(offsets);
  offsetsRef.current = offsets;
  const updateRatio = useCallback(
    (p: number, r: number) => setRatios((old) => (old[p] === r ? old : { ...old, [p]: r })),
    [],
  );
  const loadedPages = useRef(new Set<number>());
  const loaded = useCallback(
    (p: number) => {
      loadedPages.current.add(p);
      onLoaded(p);
    },
    [onLoaded],
  );
  useEffect(() => {
    const node = ref.current!;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    node.scrollTop = offsetsRef.current[page];
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (page !== scrollPage.current) {
      ref.current?.scrollTo({ top: offsetsRef.current[page] });
      setZoom(1);
      scrollPage.current = page;
    }
    if (loadedPages.current.has(page)) onLoaded(page);
  }, [page, onLoaded]);
  function onScroll() {
    const node = ref.current!;
    const top = node.scrollTop;
    setScroll(top);
    const center = top + Math.min(node.clientHeight * 0.35, 150);
    let p = 0;
    while (p < source.count - 1 && offsetsRef.current[p + 1] <= center) p++;
    if (p !== scrollPage.current) {
      scrollPage.current = p;
      onPage(p);
      if (loadedPages.current.has(p)) onLoaded(p);
      setZoom(1);
    }
  }
  const height = ref.current?.clientHeight || window.innerHeight;
  let first = 0;
  while (first < source.count - 1 && offsets[first + 1] < scroll) first++;
  let last = first;
  while (last < source.count - 1 && offsets[last] < scroll + height) last++;
  const from = Math.max(0, first - 1),
    to = Math.min(source.count - 1, last + 1, from + 4);
  const tap = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const touch = useRef<{ distance: number; scale: number }>({ distance: 0, scale: 1 });
  return (
    <div ref={ref} className="vertical-reader" onScroll={onScroll}>
      <div style={{ height: offsets[source.count], position: 'relative' }}>
        {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((p) => (
          <div
            key={p}
            className="vertical-page"
            style={{ top: offsets[p], height: heights[p] - 14 }}
          >
            <div
              className="vertical-zoom"
              onTouchStart={(e) => {
                if (e.touches.length === 2) {
                  touch.current = {
                    distance: Math.hypot(
                      e.touches[0].clientX - e.touches[1].clientX,
                      e.touches[0].clientY - e.touches[1].clientY,
                    ),
                    scale: zoom,
                  };
                }
              }}
              onTouchMove={(e) => {
                if (e.touches.length === 2 && p === page) {
                  const d = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                  );
                  setZoom(
                    Math.max(
                      1,
                      Math.min(4, (touch.current.scale * d) / Math.max(1, touch.current.distance)),
                    ),
                  );
                }
              }}
              onClick={() => {
                const now = Date.now();
                if (doubleTap && now - tap.current < 280) {
                  clearTimeout(timer.current);
                  setZoom((z) => (z === 1 ? 2.5 : 1));
                  tap.current = 0;
                } else {
                  tap.current = now;
                  timer.current = setTimeout(onTap, doubleTap ? 280 : 0);
                }
              }}
              style={{ touchAction: p === page && zoom > 1 ? 'pan-x pan-y' : 'pan-y' }}
            >
              <div style={{ width: p === page ? `${zoom * 100}%` : '100%', minHeight: '100%' }}>
                <RenderedPage
                  source={source}
                  index={p}
                  onLoaded={loaded}
                  onError={onError}
                  onRatio={updateRatio}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
