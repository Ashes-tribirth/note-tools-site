let allTools = [];

const CATEGORY_ORDER = [
  '記事を探す・読む', '記事を書く・編集する', '画像・デザインを作る', '保存・管理する',
  '交流・通知を管理する', '活動を分析・記録する', 'データを取得・出力する', '表示・操作環境を変える'
];
const PRICE_ORDER = ['無料', '条件付き無料', '1～500円', '501～1,000円', '1,001～3,000円', '3,001円以上', '月額・メンバーシップ', '価格不明'];

function normalizeCategory(tool) {
  if (CATEGORY_ORDER.includes(tool.category)) return tool.category;
  const exact = {
    'note-saver':'保存・管理する','noteしおり':'保存・管理する','Note Reader Enhancer':'表示・操作環境を変える',
    'noteの記事で目次を固定表示するChrome拡張機能':'表示・操作環境を変える','NoteBubble':'記事を書く・編集する',
    'WXRリーダー':'保存・管理する','Note Article Master':'保存・管理する','note log／おすすめページKIT':'保存・管理する',
    'Mini-Link':'画像・デザインを作る','リッチテキスト画像クリッパー':'画像・デザインを作る','SNS投稿作成ツール':'記事を書く・編集する'
  };
  if (exact[tool.name]) return exact[tool.name];
  const map = {
    'コメント・通知管理':'交流・通知を管理する','記事読む・保存':'記事を探す・読む','表示カスタマイズ':'表示・操作環境を変える',
    '活動・数字記録':'活動を分析・記録する','CSV取得':'データを取得・出力する','バックアップ・再利用':'保存・管理する',
    '記事検索・整理':'記事を探す・読む','タイトル・タグ生成':'記事を書く・編集する','執筆支援':'記事を書く・編集する',
    '見出し画像作成':'画像・デザインを作る','表・グラフ作成':'画像・デザインを作る','縦書き画像作成':'画像・デザインを作る',
    'GIF変換':'画像・デザインを作る','記事移行':'データを取得・出力する','SNS投稿支援':'記事を書く・編集する'
  };
  return map[tool.category] || '保存・管理する';
}

function deriveStatus(rawStatus) {
  const raw = rawStatus || '';
  const availability = raw.includes('開発中') ? '開発中' : raw.includes('休止') ? '休止中' : raw.includes('終了') ? '公開終了' : '公開中';
  let priceCategory = '価格不明';
  if (raw.includes('メンバーシップ')) priceCategory = '月額・メンバーシップ';
  else if (raw.includes('基本無料') || raw.includes('無料体験') || raw.includes('リポストで無料') || raw.includes('API利用料別')) priceCategory = '条件付き無料';
  else if (raw === '無料' || raw.startsWith('無料（HTML公開')) priceCategory = '無料';
  else {
    const match = raw.replace(/,/g, '').match(/(\d{1,6})\s*円/);
    if (match) {
      const price = Number(match[1]);
      priceCategory = price <= 500 ? '1～500円' : price <= 1000 ? '501～1,000円' : price <= 3000 ? '1,001～3,000円' : '3,001円以上';
    }
  }
  return { availability, priceCategory };
}

function priceBadge(tool) {
  const labels = {
    '無料':['無料','#3A8A5E'],'条件付き無料':['一部無料','#4A769F'],'1～500円':['～500円','#B8722E'],
    '501～1,000円':['～1,000円','#B8722E'],'1,001～3,000円':['～3,000円','#A36635'],'3,001円以上':['3,001円～','#955A43'],
    '月額・メンバーシップ':['限定','#3B6FA6'],'価格不明':['価格不明','#888']
  };
  const [text,color] = labels[tool.priceCategory];
  return { text, color };
}

function parseCSV(text) {
  const rows=[]; let row=[], field='', inQuotes=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i], n=text[i+1];
    if (inQuotes) { if (c==='"'&&n==='"'){field+='"';i++;} else if(c==='"')inQuotes=false; else field+=c; }
    else if(c==='"')inQuotes=true; else if(c===','){row.push(field);field='';} else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';} else if(c!=='\r')field+=c;
  }
  if(field.length||row.length){row.push(field);rows.push(row);} return rows;
}

async function loadTools() {
  try {
    const response=await fetch('./note%20tools.csv');
    if(!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const rows=parseCSV(await response.text()).filter(r=>r.some(cell=>cell.trim()!==''));
    allTools=rows.slice(1).map(r=>{
      const tool={name:(r[0]||'').trim(),author:(r[1]||'').trim(),category:(r[2]||'').trim(),description:(r[3]||'').trim(),rawStatus:(r[4]||'').trim(),link:(r[5]||'').trim(),updatedAt:(r[6]||'').trim(),thumbnail:(r[7]||'').trim()};
      tool.category=normalizeCategory(tool); Object.assign(tool,deriveStatus(tool.rawStatus)); return tool;
    });
    populateFilters(); updatePageDate(); renderTools(); attachListeners();
  } catch(error) {
    console.error(error); document.getElementById('toolsGrid').innerHTML=`<div class="empty-state">データの読み込みに失敗しました。<br>エラー: ${escapeHTML(error.message)}</div>`;
  }
}

function populateFilters() {
  const categorySelect=document.getElementById('categoryFilter');
  CATEGORY_ORDER.forEach(category=>{const count=allTools.filter(t=>t.category===category).length;if(count)categorySelect.add(new Option(`${category} (${count})`,category));});
  const priceSelect=document.getElementById('priceFilter');
  PRICE_ORDER.forEach(price=>{const count=allTools.filter(t=>t.priceCategory===price).length;if(count)priceSelect.add(new Option(`${price} (${count})`,price));});
}
function updatePageDate(){const latest=allTools.map(t=>t.updatedAt).filter(Boolean).sort().at(-1)||'—';document.getElementById('pageUpdatedAt').textContent=`最終更新 ${latest.replaceAll('-','.')}`;}
function escapeHTML(str){const div=document.createElement('div');div.textContent=str;return div.innerHTML;}
function allowedHttpsUrl(rawUrl,host){try{const u=new URL(rawUrl);return u.protocol==='https:'&&u.hostname===host&&!u.port&&!u.username&&!u.password?u.href:'';}catch{return '';}}
const safeNoteUrl=url=>allowedHttpsUrl(url,'note.com');
const safeThumbnailUrl=url=>allowedHttpsUrl(url,'assets.st-note.com');

function renderTools(){
  const search=document.getElementById('searchInput').value.toLowerCase(), category=document.getElementById('categoryFilter').value, price=document.getElementById('priceFilter').value;
  const showThumbs=document.getElementById('thumbnailDisplay').checked, favoritesOnly=document.getElementById('favoriteFilter').checked, favorites=getFavorites();
  const filtered=allTools.filter(t=>[t.name,t.author,t.description,t.category,t.rawStatus].some(v=>v.toLowerCase().includes(search))&&(!category||t.category===category)&&(!price||t.priceCategory===price)&&(!favoritesOnly||favorites.has(toolKey(t))));
  document.getElementById('resultCount').textContent=`${filtered.length} 件`;
  document.getElementById('resetBtn').style.display=(search||category||price||favoritesOnly)?'inline-block':'none';
  const grid=document.getElementById('toolsGrid');
  if(!filtered.length){grid.innerHTML='<div class="empty-state">該当するツールが見つかりません</div>';return;}
  grid.innerHTML=filtered.map(tool=>{
    const badge=priceBadge(tool), key=toolKey(tool), fav=favorites.has(key), noteUrl=safeNoteUrl(tool.link), thumb=safeThumbnailUrl(tool.thumbnail);
    const bodyStart=noteUrl?`<a class="card-body-link" href="${escapeHTML(noteUrl)}" target="_blank" rel="noopener noreferrer">`:'<div class="card-body-link">', bodyEnd=noteUrl?'</a>':'</div>';
    const availability=tool.availability!=='公開中'?`<span class="availability-badge">${escapeHTML(tool.availability)}</span>`:'';
    const detail=tool.rawStatus&&tool.rawStatus!==badge.text?`<div class="card-status-detail">${escapeHTML(tool.rawStatus)}</div>`:'';
    return `<article class="card">${showThumbs&&thumb?(noteUrl?`<a class="card-thumbnail-link" href="${escapeHTML(noteUrl)}" target="_blank" rel="noopener noreferrer"><img class="card-thumbnail" src="${escapeHTML(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></a>`:`<img class="card-thumbnail" src="${escapeHTML(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`):''}<div class="card-inner"><div class="card-top"><div class="card-title-wrap"><button class="favorite-btn${fav?' is-favorite':''}" type="button" data-key="${escapeHTML(encodeURIComponent(key))}" aria-label="${fav?'お気に入りから削除':'お気に入りに追加'}" aria-pressed="${fav}">${fav?'♥':'♡'}</button>${noteUrl?`<a class="card-title-link" href="${escapeHTML(noteUrl)}" target="_blank" rel="noopener noreferrer">`:'<div class="card-title-link">'}<span class="card-title">${escapeHTML(tool.name)}</span>${noteUrl?'</a>':'</div>'}</div><div class="badge-stack"><span class="badge" style="color:${badge.color};">${escapeHTML(badge.text)}</span>${availability}</div></div>${bodyStart}<div class="card-author">${escapeHTML(tool.author)}</div><div class="card-desc">${escapeHTML(tool.description)}</div>${detail}<div class="card-category">${escapeHTML(tool.category)}</div>${bodyEnd}</div></article>`;
  }).join('');
}

const toolKey=tool=>`${tool.name}|||${tool.author}`;
function getFavorites(){try{const saved=JSON.parse(localStorage.getItem('favoriteTools')||'[]');return new Set(Array.isArray(saved)?saved:[]);}catch{return new Set();}}
function toggleFavorite(key){const f=getFavorites();f.has(key)?f.delete(key):f.add(key);localStorage.setItem('favoriteTools',JSON.stringify([...f]));renderTools();}
function attachListeners(){
  document.getElementById('searchInput').addEventListener('input',renderTools);document.getElementById('categoryFilter').addEventListener('change',renderTools);document.getElementById('priceFilter').addEventListener('change',renderTools);
  document.getElementById('thumbnailDisplay').addEventListener('change',e=>{localStorage.setItem('thumbnailDisplay',e.target.checked?'show':'hide');renderTools();});
  document.getElementById('favoriteFilter').addEventListener('change',renderTools);
  document.getElementById('toolsGrid').addEventListener('click',e=>{const b=e.target.closest('.favorite-btn');if(b){e.preventDefault();e.stopPropagation();toggleFavorite(decodeURIComponent(b.dataset.key));}});
  document.getElementById('resetBtn').addEventListener('click',()=>{document.getElementById('searchInput').value='';document.getElementById('categoryFilter').value='';document.getElementById('priceFilter').value='';document.getElementById('favoriteFilter').checked=false;renderTools();});
}
const savedThumbnailDisplay=localStorage.getItem('thumbnailDisplay');if(savedThumbnailDisplay==='show'||savedThumbnailDisplay==='hide')document.getElementById('thumbnailDisplay').checked=savedThumbnailDisplay==='show';
loadTools();
