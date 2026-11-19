// Sway Smart Wave Filters
const STORAGE_KEY = 'tonika.wave-filters';

export const MOOD_OPTIONS = [
  { id: '', label: 'Все настроения', icon: 'sparkle' },
  { id: 'bright', label: 'Бодрое', icon: 'zap' },
  { id: 'calm', label: 'Спокойное', icon: 'sun' },
  { id: 'focus', label: 'Для фокуса', icon: 'target' },
  { id: 'night', label: 'После полуночи', icon: 'moon' }
];

export const CHARACTER_OPTIONS = [
  { id: 'mix', label: 'Вперемешку', desc: 'Умный баланс любимого и нового' },
  { id: 'favorite', label: 'Любимое', desc: 'Чаще знакомые и понравившиеся треки' },
  { id: 'discovery', label: 'Незнакомое', desc: 'Больше ещё не услышанных треков' }
];
export const ENERGY_OPTIONS=[{id:'balanced',label:'Любая энергия'},{id:'calm',label:'Спокойнее'},{id:'bright',label:'Энергичнее'}];

export const LANGUAGE_OPTIONS = [
  { id: 'any', label: 'Любой язык' },
  { id: 'ru', label: 'Русские' },
  { id: 'en', label: 'Иностранные' }
];

export function loadWaveFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        mood: MOOD_OPTIONS.some(x=>x.id===parsed.mood)?parsed.mood:'',
        character: CHARACTER_OPTIONS.some(x=>x.id===parsed.character)?parsed.character:'mix',
        language: LANGUAGE_OPTIONS.some(x=>x.id===parsed.language)?parsed.language:'any',
        energy: ENERGY_OPTIONS.some(x=>x.id===parsed.energy)?parsed.energy:'balanced'
      };
    }
  } catch {}
  return { mood: '', character: 'mix', language: 'any',energy:'balanced' };
}

export function saveWaveFilters(filters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {}
}

export function applyWaveFiltersToPool(tracks, filters, { likes = new Set(), history = [] } = {}) {
  let pool = [...tracks];

  // 1. Language filter
  if (filters.language === 'ru') {
    pool = pool.filter(t => /[а-яё]/i.test((t.title || '') + (t.artist || '')));
  } else if (filters.language === 'en') {
    pool = pool.filter(t => !/[а-яё]/i.test((t.title || '') + (t.artist || '')));
  }

  // 2. Character filter
  if (filters.character === 'favorite') {
    const historyIds = new Set(history.map(e => e.id));
    const favored = pool.filter(t => likes.has(t.id) || historyIds.has(t.id));
    if (favored.length >= 8) {
      pool = favored;
    }
  } else if (filters.character === 'discovery') {
    const historyIds = new Set(history.map(e => e.id));
    const unfamiliar = pool.filter(t => !likes.has(t.id) && !historyIds.has(t.id));
    if (unfamiliar.length >= 8) {
      pool = unfamiliar;
    }
  }

  // 3. Mood filter
  if (filters.mood) {
    const matching = pool.filter(t => (t.moods || []).includes(filters.mood));
    if (matching.length >= 6) {
      pool = matching;
    }
  }
  if(filters.energy&&filters.energy!=='balanced'){
    const matching=pool.filter(t=>t.moods?.includes(filters.energy));
    if(matching.length)pool=matching;
  }

  return pool;
}
