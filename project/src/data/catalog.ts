import { blankComic, type Comic } from '../models';
// Years refer to the original story's publication, not a particular Russian edition.
// Verified against DC's official publication pages; links are in docs/CATALOG.md.
const records: [string, string, string, number, number | undefined, string][] = [
  ['year-one', 'Год первый', 'Фрэнк Миллер · Дэвид Маззуккелли', 1987, undefined, '#b55b53'],
  ['long-halloween', 'Долгий Хэллоуин', 'Джеф Лоэб · Тим Сэйл', 1996, 1997, '#537da1'],
  ['dark-victory', 'Тёмная победа', 'Джеф Лоэб · Тим Сэйл', 1999, 2000, '#677f6f'],
  ['court-owls', 'Суд Сов', 'Скотт Снайдер · Грег Капулло', 2011, 2012, '#b7afa2'],
  ['city-owls', 'Город Сов', 'Скотт Снайдер · Грег Капулло', 2012, undefined, '#9a8059'],
  ['killing-joke', 'Убийственная шутка', 'Алан Мур · Брайан Болланд', 1988, undefined, '#9c78a8'],
  ['hush', 'Тихо!', 'Джеф Лоэб · Джим Ли · Скотт Уильямс', 2002, 2003, '#779a98'],
  [
    'dark-knight',
    'Возвращение Тёмного рыцаря',
    'Фрэнк Миллер · Клаус Янсон · Линн Варли',
    1986,
    undefined,
    '#758ab6',
  ],
  [
    'black-mirror',
    'Чёрное зеркало',
    'Скотт Снайдер · Джок · Франческо Франкавилла',
    2010,
    2011,
    '#78818d',
  ],
  ['white-knight', 'Белый рыцарь', 'Шон Мёрфи', 2017, 2018, '#c5b99f'],
  [
    'absolute-batman',
    'Абсолютный Бэтмен',
    'Скотт Снайдер · Ник Драготта',
    2024,
    undefined,
    '#ae835e',
  ],
];
export function initialCatalog(): Comic[] {
  return records.map(([id, title, authors, year, yearEnd, tone], i) => ({
    ...blankComic(),
    id: `dc-${id}`,
    title: id === 'absolute-batman' ? title : `Бэтмен. ${title}`,
    series:
      id === 'absolute-batman'
        ? 'Absolute Universe'
        : ['court-owls', 'city-owls'].includes(id)
          ? 'Бэтмен · New 52'
          : 'Бэтмен',
    authors,
    year,
    yearEnd,
    tone,
    addedAt: Date.now() - i,
    physical: ['court-owls', 'city-owls', 'dark-knight'].includes(id) ? 'yes' : 'unknown',
    physicalGroup: ['court-owls', 'city-owls'].includes(id) ? 'owls-combined' : undefined,
    edition: ['court-owls', 'city-owls'].includes(id)
      ? 'Суд Сов + Город Сов · объединённое издание'
      : '',
  }));
}
