const CATEGORY_ORDER = [
  '記事を探す・読む',
  '記事を書く・編集する',
  '画像・デザインを作る',
  '保存・管理する',
  '交流・通知を管理する',
  '活動を分析・記録する',
  'データを取得・出力する',
  '表示・操作環境を変える'
];

const PRICE_ORDER = [
  '無料',
  '条件付き無料',
  '1～500円',
  '501～1,000円',
  '1,001～3,000円',
  '3,001円以上',
  '月額・メンバーシップ',
  '価格不明'
];

const PRICE_BADGES = {
  '無料': ['無料', 'free'],
  '条件付き無料': ['一部無料', 'conditional'],
  '1～500円': ['～500円', 'low'],
  '501～1,000円': ['～1,000円', 'low'],
  '1,001～3,000円': ['～3,000円', 'mid'],
  '3,001円以上': ['3,001円～', 'high'],
  '月額・メンバーシップ': ['限定', 'membership'],
  '価格不明': ['価格不明', 'unknown']
};

const FAVORITES_KEY = 'favoriteTools';
const THUMBNAIL_KEY = 'thumbnailDisplay';

const updateFilterStyles = document.createElement('link');
updateFilterStyles.rel = 'stylesheet';
updateFilterStyles.href = './update-filter.css';
document.head.append(updateFilterStyles);

const elements = {
  search: document.getElementById('searchInput'),
  category: document.getElementById('categoryFilter'),
  price: document.getElementById('priceFilter'),
  thumbnails: document.getElementById('thumbnailDisplay'),
  favoritesOnly: document.getElementById('favoriteFilter'),
  reset: document.getElementById('resetBtn'),
  count: document.getElementById('resultCount'),
  grid: document.getElementById('toolsGrid'),
  updatedAt: document.getElementById('pageUpdatedAt'),
  updateLog: document.getElementById('updateLogList')
};

let allTools = [];
let updateLogEntries = [];
let activeChangeFilter = null;

function normalizeCategory(tool) {
  return CATEGORY_ORDER.includes(tool.category) ? tool.category : '保存・管理する';
}

function deriveStatus(rawStatus = '') {
  const availability = rawStatus.includes('開発中')
    ? '開発中'
    : rawStatus.includes('休止')
      ? '休止中'
      : rawStatus.includes('終了')
        ? '公開終了'
        : '公開中';

  let priceCategory = '価格不明';

  if (rawStatus.includes('メンバーシップ')) {
    priceCategory = '月額・メンバーシップ';
  } else if (
    rawStatus.includes('基本無料') ||
    rawStatus.includes('無料体験') ||
    rawStatus.includes('リポストで無料') ||
    rawStatus.includes('API利用料別')
  ) {
    priceCategory = '条件付き無料';
  } else if (rawStatus === '無料' || rawStatus.startsWith('無料（HTML公開')) {
    priceCategory = '無料';
  } else {
    const match = rawStatus.replace(/,/g, '').match(/(\d{1,6})\s*円/);
    if (match) {
      const price = Number(match[1]);
      priceCategory = price <= 500
        ? '1～500円'
        : price <= 1000
          ? '501～1,000円'
          : price <= 3000
            ? '1,001～3,000円'
            : '3,001円以上';
    }
  }

  return { availability, priceCategory };
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function rowToTool(row) {
  const tool = {
    name: (row[0] || '').trim(),
    author: (row[1] || '').trim(),
    category: (row[2] || '').trim(),
    description: (row[3] || '').trim(),
    rawStatus: (row[4] || '').trim(),
    link: (row[5] || '').trim(),
    updatedAt: (row[6] || '').trim(),
    thumbnail: (row[7] || '').trim()
  };

  tool.category = normalizeCategory(tool);
  return Object.assign(tool, deriveStatus(tool.rawStatus));
}

function populateSelect(select, order, key) {
  order.forEach(value => {
    const count = allTools.filter(tool => tool[key] === value).length;
    if (count) select.add(new Option(`${value} (${count})`, value));
  });
}

function populateFilters() {
  populateSelect(elements.category, CATEGORY_ORDER, 'category');
  populateSelect(elements.price, PRICE_ORDER, 'priceCategory');
}

function updatePageDate() {
  const latest = allTools
    .map(tool => tool.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || '—';

  elements.updatedAt.textContent = `最終更新 ${latest.replaceAll('-', '.')}`;
}

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function formatShortDate(date) {
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${year.slice(-2)}/${month}/${day}`;
}

function changeTypeFromSummaryPart(part) {
  if (/^追加\d+件$/.test(part)) return 'added';
  if (/^更新\d+件$/.test(part)) return 'updated';
  return '';
}

function renderUpdateSummary(update) {
  const summary = update.summary || '';
  const parts = summary.split(/(追加\d+件|更新\d+件)/g).filter(Boolean);

  return parts.map(part => {
    const type = changeTypeFromSummaryPart(part);
    const targets = type && Array.isArray(update.changes?.[type]) ? update.changes[type] : [];

    if (!type || targets.length === 0) return escapeHTML(part);

    const isActive = activeChangeFilter?.date === update.date && activeChangeFilter?.type === type;
    const label = type === 'added' ? '追加' : '更新';

    return `<button class="update-log-filter${isActive ? ' is-active' : ''}" type="button" data-update-date="${escapeHTML(update.date || '')}" data-change-type="${type}" aria-pressed="${isActive}" title="${formatShortDate(update.date || '')}に${label}された${targets.length}件だけ表示">${escapeHTML(part)}</button>`;
  }).join('');
}

function renderUpdateLog(updates) {
  if (!elements.updateLog) return;

  if (!Array.isArray(updates) || updates.length === 0) {
    elements.updateLog.innerHTML = '<p>更新履歴はまだありません</p>';
    return;
  }

  elements.updateLog.innerHTML = updates.map(update => {
    const date = escapeHTML(update.date || '');
    return `<p><time datetime="${date}">${formatShortDate(date)}</time><span>${renderUpdateSummary(update)}</span></p>`;
  }).join('');
}

async function loadUpdateLog() {
  if (!elements.updateLog) return;

  try {
    const response = await fetch('./updates.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    updateLogEntries = await response.json();
    renderUpdateLog(updateLogEntries);
  } catch (error) {
    console.error(error);
    elements.updateLog.innerHTML = '<p>更新履歴の読み込みに失敗しました</p>';
  }
}

function allowedHttpsUrl(rawUrl, host) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' &&
      url.hostname === host &&
      !url.port &&
      !url.username &&
      !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}

const safeNoteUrl = url => allowedHttpsUrl(url, 'note.com');
const safeThumbnailUrl = url => allowedHttpsUrl(url, 'assets.st-note.com');
const toolKey = tool => `${tool.name}|||${tool.author}`;

function getFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function toggleFavorite(key) {
  const favorites = getFavorites();
  favorites.has(key) ? favorites.delete(key) : favorites.add(key);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  renderTools();
}

function createCard(tool, showThumbnails, favorites) {
  const [badgeText, badgeClass] = PRICE_BADGES[tool.priceCategory];
  const key = toolKey(tool);
  const isFavorite = favorites.has(key);
  const noteUrl = safeNoteUrl(tool.link);
  const thumbnailUrl = safeThumbnailUrl(tool.thumbnail);
  const safeUrl = escapeHTML(noteUrl);

  const thumbnail = showThumbnails && thumbnailUrl
    ? noteUrl
      ? `<a class="card-thumbnail-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer"><img class="card-thumbnail" src="${escapeHTML(thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`
      : `<img class="card-thumbnail" src="${escapeHTML(thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '';

  const title = noteUrl
    ? `<a class="card-title-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer"><span class="card-title">${escapeHTML(tool.name)}</span></a>`
    : `<div class="card-title-link"><span class="card-title">${escapeHTML(tool.name)}</span></div>`;

  const bodyStart = noteUrl
    ? `<a class="card-body-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">`
    : '<div class="card-body-link">';
  const bodyEnd = noteUrl ? '</a>' : '</div>';

  const availability = tool.availability !== '公開中'
    ? `<span class="availability-badge">${escapeHTML(tool.availability)}</span>`
    : '';

  const statusDetail = tool.rawStatus && tool.rawStatus !== badgeText
    ? `<div class="card-status-detail">${escapeHTML(tool.rawStatus)}</div>`
    : '';

  return `<article class="card">${thumbnail}<div class="card-inner"><div class="card-top"><div class="card-title-wrap"><button class="favorite-btn${isFavorite ? ' is-favorite' : ''}" type="button" data-key="${escapeHTML(encodeURIComponent(key))}" aria-label="${isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}" aria-pressed="${isFavorite}">${isFavorite ? '♥' : '♡'}</button>${title}</div><div class="badge-stack"><span class="badge badge-${badgeClass}">${escapeHTML(badgeText)}</span>${availability}</div></div>${bodyStart}<div class="card-author">${escapeHTML(tool.author)}</div><div class="card-desc">${escapeHTML(tool.description)}</div>${statusDetail}<div class="card-category">${escapeHTML(tool.category)}</div>${bodyEnd}</div></article>`;
}

function renderTools() {
  const search = elements.search.value.toLowerCase();
  const category = elements.category.value;
  const price = elements.price.value;
  const showThumbnails = elements.thumbnails.checked;
  const favoritesOnly = elements.favoritesOnly.checked;
  const favorites = getFavorites();
  const changeTargets = activeChangeFilter ? new Set(activeChangeFilter.names) : null;

  const filtered = allTools.filter(tool =>
    [tool.name, tool.author, tool.description, tool.category, tool.rawStatus]
      .some(value => value.toLowerCase().includes(search)) &&
    (!category || tool.category === category) &&
    (!price || tool.priceCategory === price) &&
    (!favoritesOnly || favorites.has(toolKey(tool))) &&
    (!changeTargets || changeTargets.has(tool.name))
  );

  if (activeChangeFilter) {
    const order = new Map(activeChangeFilter.names.map((name, index) => [name, index]));
    filtered.sort((a, b) => (order.get(a.name) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.name) ?? Number.MAX_SAFE_INTEGER));
  }

  elements.count.textContent = `${filtered.length} 件`;
  elements.reset.hidden = !(search || category || price || favoritesOnly || activeChangeFilter);

  elements.grid.innerHTML = filtered.length
    ? filtered.map(tool => createCard(tool, showThumbnails, favorites)).join('')
    : '<div class="empty-state">該当するツールが見つかりません</div>';
}

function resetFilters() {
  elements.search.value = '';
  elements.category.value = '';
  elements.price.value = '';
  elements.favoritesOnly.checked = false;
  activeChangeFilter = null;
  renderUpdateLog(updateLogEntries);
  renderTools();
}

function toggleUpdateFilter(date, type) {
  const update = updateLogEntries.find(entry => entry.date === date);
  const names = Array.isArray(update?.changes?.[type]) ? update.changes[type] : [];
  if (names.length === 0) return;

  const sameFilter = activeChangeFilter?.date === date && activeChangeFilter?.type === type;
  activeChangeFilter = sameFilter ? null : { date, type, names };
  renderUpdateLog(updateLogEntries);
  renderTools();
}

function removeBrokenThumbnail(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.classList.contains('card-thumbnail')) return;
  const link = image.closest('.card-thumbnail-link');
  (link || image).remove();
}

function attachListeners() {
  elements.search.addEventListener('input', renderTools);
  elements.category.addEventListener('change', renderTools);
  elements.price.addEventListener('change', renderTools);
  elements.favoritesOnly.addEventListener('change', renderTools);
  elements.reset.addEventListener('click', resetFilters);

  elements.thumbnails.addEventListener('change', event => {
    localStorage.setItem(THUMBNAIL_KEY, event.target.checked ? 'show' : 'hide');
    renderTools();
  });

  elements.updateLog?.addEventListener('click', event => {
    const button = event.target.closest('.update-log-filter');
    if (!button) return;
    toggleUpdateFilter(button.dataset.updateDate, button.dataset.changeType);
  });

  elements.grid.addEventListener('click', event => {
    const button = event.target.closest('.favorite-btn');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(decodeURIComponent(button.dataset.key));
  });

  elements.grid.addEventListener('error', removeBrokenThumbnail, true);
}

function restoreDisplaySettings() {
  const saved = localStorage.getItem(THUMBNAIL_KEY);
  if (saved === 'show' || saved === 'hide') {
    elements.thumbnails.checked = saved === 'show';
  }
}

async function loadTools() {
  try {
    const response = await fetch('./note%20tools.csv');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const rows = parseCSV(await response.text())
      .filter(row => row.some(cell => cell.trim() !== ''));

    allTools = rows.slice(1).map(rowToTool);
    populateFilters();
    updatePageDate();
    renderTools();
    attachListeners();
  } catch (error) {
    console.error(error);
    elements.grid.innerHTML = `<div class="empty-state">データの読み込みに失敗しました。<br>エラー: ${escapeHTML(error.message)}</div>`;
  }
}

restoreDisplaySettings();
loadUpdateLog();
loadTools();
