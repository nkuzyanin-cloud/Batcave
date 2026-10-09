import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, BookOpen, Monitor, Library, HelpCircle } from 'lucide-react';
import { getAsset } from '../storage/db';
import { type Comic, percent } from '../models';
export function Bat({ className = '' }: { className?: string }) {
  return (
    <svg className={`bat ${className}`} viewBox="0 0 140 54" fill="currentColor" aria-hidden="true">
      <path d="M3 5C24 10 30 13 41 28L52 23 56 4 65 15 75 15 84 4 88 23 99 28C110 13 116 10 137 5L126 22 114 21 108 34 93 32 80 48 70 43 60 48 47 32 32 34 26 21 14 22Z" />
    </svg>
  );
}
export function useBlobUrl(id?: string) {
  const [url, set] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    set(undefined);
    if (id)
      void getAsset(id).then((a) => {
        if (a && active) {
          objectUrl = URL.createObjectURL(a.blob);
          set(objectUrl);
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url;
}
export function Cover({ comic, photo = false }: { comic: Comic; photo?: boolean }) {
  const url = useBlobUrl(photo ? comic.photoId || comic.coverId : comic.coverId);
  return (
    <div
      className="cover"
      style={
        {
          '--cover-color': comic.tone,
          '--cover-title-divisor': Math.max(
            5.5,
            Math.max(
              ...comic.title
                .replace(/^Бэтмен\. /, '')
                .split(/\s+/)
                .map((word) => word.length),
            ) * 0.85,
          ),
        } as React.CSSProperties
      }
    >
      {url ? (
        <img src={url} alt={`Обложка: ${comic.title}`} loading="lazy" />
      ) : (
        <div className="cover-art">
          <span className="cover-edition">DC / ЛИЧНЫЙ АРХИВ</span>
          <span className="cover-bat">
            <Bat />
          </span>
          <span className="cover-name">{comic.title.replace(/^Бэтмен\. /, '')}</span>
          <span className="cover-arch">
            {/бэтмен|batman/i.test(comic.title + comic.series) ? 'BATMAN' : 'DC COMICS'}
          </span>
          <span className="cover-year">{comic.year || 'DC COMICS'}</span>
          <div className="cover-lines" />
        </div>
      )}
    </div>
  );
}
export function Progress({ value }: { value: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Прогресс чтения"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: `${value}%` }} />
    </div>
  );
}
export function Card({
  comic,
  onClick,
  photo = false,
}: {
  comic: Comic;
  onClick: () => void;
  photo?: boolean;
}) {
  return (
    <button className="comic-card" onClick={onClick}>
      <div className="card-image">
        <Cover comic={comic} photo={photo} />
        {comic.completed && <span className="cover-tag">Прочитано</span>}
        {comic.digital && <span className="format-tag">{comic.digital.format.toUpperCase()}</span>}
      </div>
      <h3>{comic.title.replace(/^Бэтмен\. /, '')}</h3>
      <p className="card-year">
        {comic.year}
        {comic.yearEnd ? `–${comic.yearEnd}` : ''}
        {comic.pageCount ? ` · ${comic.pageCount} стр.` : ''}
      </p>
      <p className="card-author">{comic.authors || 'Автор не указан'}</p>
      <div className="card-ownership">
        <span
          title={
            comic.physical === 'yes'
              ? 'Есть в бумаге'
              : comic.physical === 'no'
                ? 'Нет в бумаге'
                : 'Бумага не проверена'
          }
        >
          {comic.physical === 'unknown' ? <HelpCircle size={13} /> : <Library size={13} />}
          <span>
            {comic.physical === 'yes'
              ? 'На полке'
              : comic.physical === 'no'
                ? 'Нет бумаги'
                : 'Не проверено'}
          </span>
        </span>
        <span className={comic.digital ? 'available' : ''}>
          <Monitor size={13} />
          {comic.digital ? 'Файл' : ''}
        </span>
      </div>
      {comic.digital || comic.completed ? (
        <>
          <Progress value={percent(comic)} />
          <span className="card-percent">{percent(comic)}% прочитано</span>
        </>
      ) : (
        <span className="no-copy">Нет цифровой копии</span>
      )}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const all = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button,input,select,textarea,[tabindex="0"]',
          ) || [],
        ).filter((x) => !x.hasAttribute('disabled'));
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <BookOpen size={30} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
