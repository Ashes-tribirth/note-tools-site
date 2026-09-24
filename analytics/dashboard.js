'use strict';
const $ = id => document.getElementById(id);
const format = value => new Intl.NumberFormat('ja-JP').format(value);
const definitions = [
  ['users', '利用者', '人', '期間内の重複を除く'],
  ['clicks', 'note記事へのクリック', '回', '記事への送客'],
  ['searches', 'Compass内の検索', '回', '検索操作'],
  ['sessions', '訪問', '回', 'セッション数'],
  ['views', 'ページ表示', '回', 'Compass本体のPV']
];
let snapshot, status, selected = '7';
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function delta(current, previous) {
  if (previous === 0) return {text: current ? '前期間0回 → ' + format(current) : '変化なし', tone: current ? 'up' : 'same'};
  const pct = (current - previous) / previous * 100;
  return {text: (pct > 0 ? '↑ +' : pct < 0 ? '↓ ' : '') + pct.toFixed(1) + '%', tone: pct > 0 ? 'up' : pct < 0 ? 'down' : 'same'};
}
function rangeLabel(period) { return period.start + ' 〜 ' + period.end; }
function metricCards(period) {
  $('metrics').replaceChildren();
  definitions.forEach(([key, title, unit, detail], i) => {
    const card = node('div', undefined, 'metric' + (i < 3 ? ' primary' : ''));
    card.append(node('div', title, 'metric-label'));
    const value = node('div', format(period.current[key]), 'value');
    value.append(node('span', unit, 'unit'));
    const d = delta(period.current[key], period.previous[key]);
    if (!period.previous[key] && period.current[key]) d.text = '前期間0' + unit + ' → ' + format(period.current[key]) + unit;
    card.append(value, node('div', d.text, 'delta ' + d.tone), node('div', '前期間 ' + format(period.previous[key]) + unit + ' · ' + detail, 'previous'));
    $('metrics').append(card);
  });
}
function rankList(id, data, type = '') {
  const target = $(id); target.replaceChildren();
  if (data.status !== 'ok') { target.append(node('p', data.reason || 'この項目はまだ取得できていません。', 'empty')); return; }
  if (!data.rows.length) target.append(node('p', data.withheld ? '公開対象に該当するデータはありません。' : 'この期間の記録はありません。', 'empty'));
  else {
    const list = node('ol', undefined, 'rank-list');
    data.rows.forEach((item, i) => {
      const row = node('li'); const label = node('div'); label.append(node('div', item.name, 'name'));
      const sub = item.author || item.kind || (item.scope ? (item.scope === 'all' ? '条件なし' : '絞り込みあり') : '');
      if (sub) label.append(node('div', sub, 'sub'));
      const amount = node('div', format(item.count) + '回', 'amount');
      if (item.previous !== undefined) { const d = delta(item.count, item.previous); amount.append(node('span', d.text, 'delta ' + d.tone)); }
      row.append(node('span', String(i + 1).padStart(2, '0'), 'rank'), label, amount); list.append(row);
    });
    target.append(list);
  }
  if (data.withheld) target.append(node('p', format(data.withheld) + '回は' + (type === 'tool' ? '名称未取得・現行掲載と照合できないため' : '公開対象外のため') + '内訳非表示。総回数には含みます。', 'privacy'));
}
function svgNode(name, attrs, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, v));
  if (text !== undefined) el.textContent = text;
  return el;
}
function chart(period, key, title, unit, actions) {
  const box = node('div', undefined, 'chart' + (actions ? ' actions' : ''));
  box.append(node('h3', title + '（' + unit + '／日）'), node('p', rangeLabel(period)));
  const svg = svgNode('svg', {viewBox:'0 0 340 156', role:'img', 'aria-label': title + 'の日別推移'});
  const rows = period.daily, max = Math.max(1, ...rows.map(r => r[key]));
  [0, 1].forEach(t => { const y = 120 - t * 95; svg.append(svgNode('line',{x1:40,y1:y,x2:327,y2:y,class:'grid'}),svgNode('text',{x:34,y:y+4,'text-anchor':'end'},format(t * max))); });
  const coords = rows.map((r,i) => [rows.length === 1 ? 182 : 42 + i / (rows.length-1) * 283, 120 - r[key] / max * 95]);
  if (coords.length > 1) svg.append(svgNode('polyline',{points:coords.map(c=>c.join(',')).join(' '),class:'line'}));
  coords.forEach(([x,y],i) => { const point = svgNode('circle',{cx:x,cy:y,r:rows.length>14?2:3}); point.append(svgNode('title',{},rows[i].date + '：' + format(rows[i][key]) + unit)); svg.append(point); });
  if (rows.length) svg.append(svgNode('text',{x:40,y:146},rows[0].date.slice(5)),svgNode('text',{x:327,y:146,'text-anchor':'end'},rows.at(-1).date.slice(5)));
  box.append(svg);
  const details = node('details'); details.append(node('summary','日別の数値を見る'));
  rows.forEach(r=>details.append(node('div',r.date + '：' + format(r[key]) + unit)));
  box.append(details); return box;
}
function render() {
  document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period === selected)));
  const notice = [];
  if (!snapshot) {
    $('report').hidden = true;
    $('notice').textContent = status?.state === 'setup_required' ? 'GA4との接続設定待ちです。データはまだ取得されていません。未取得を「0人」として表示しません。' : '集計データを取得できませんでした。時間を置いて再読み込みしてください。';
    return;
  }
  const age = (Date.now() - Date.parse(snapshot.generatedAt)) / 3600000;
  $('freshness').textContent = '最終取得 ' + new Date(snapshot.generatedAt).toLocaleString('ja-JP', {timeZone:snapshot.timezone}) + '（' + snapshot.timezone + '）';
  if (status?.state !== 'ok') notice.push('最新の取得に失敗、または接続設定待ちです。前回成功時のデータを表示しています。');
  if (age > 8) notice.push('データの更新が遅れています。最終取得日時を確認してください。');
  const p = snapshot.periods[selected];
  if (!p || p.status === 'pending') { $('report').hidden=true; $('period-label').textContent='今日'; $('notice').textContent=p?.reason || 'この期間のデータは未取得です。'; return; }
  $('report').hidden=false;
  $('period-label').textContent = rangeLabel(p) + ' ／ 比較：' + p.previousStart + ' 〜 ' + p.previousEnd;
  if (selected === 'today') notice.push('今日・昨日とも0時〜' + p.throughHour + '時の途中集計。GA4の処理遅延があるため暫定値です。');
  else notice.push('昨日までの' + selected + '日間。直近の数値はGA4の処理後に変わることがあります。');
  notice.push(...(snapshot.warnings || [])); $('notice').textContent=notice.join(' ');
  metricCards(p);
  $('insights').replaceChildren();
  for (const key of ['users','clicks']) {
    const def=definitions.find(d=>d[0]===key), current=p.current[key], prev=p.previous[key];
    const diff=current-prev;
    $('insights').append(node('li', def[1] + 'は' + format(current) + def[2] + '。前期間の' + format(prev) + def[2] + 'から' + (diff ? format(Math.abs(diff)) + def[2] + (diff>0?'増加。':'減少。') : '変化なし。')));
  }
  const top=p.tools.rows?.[0]; if(top) $('insights').append(node('li','記事へのクリックが最多なのは「'+top.name+'」（'+format(top.count)+'回）。'));
  const category=p.filters.rows?.find(r=>r.kind==='カテゴリ'); if(category) $('insights').append(node('li','よく選ばれたカテゴリは「'+category.name+'」（'+format(category.count)+'回）。'));
  if(p.zeroSearches.rows?.some(r=>r.scope==='all')) $('insights').append(node('li','条件なしでも見つからなかった検索語があります。「検索結果が0件だった言葉」を掲載候補の検討に使えます。'));
  $('trends').replaceChildren(chart(p,'users','利用者','人',false),chart(p,'views','ページ表示','回',false),chart(p,'searches','Compass内の検索','回',true),chart(p,'clicks','note記事へのクリック','回',true));
  rankList('tools',p.tools,'tool'); rankList('keywords',p.keywords); rankList('zeroSearches',p.zeroSearches); rankList('filters',p.filters);
  rankList('sources',{status:'ok',rows:p.sources});
  $('audience').replaceChildren();
  for(const [key,label] of [['new','初回と判定'],['returning','再訪と判定']]) { const row=node('div',undefined,'audience'); row.append(node('span',label),node('strong',format(p.audience[key])+'人')); $('audience').append(row); }
}
async function getJSON(path) { const r=await fetch(path,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.period;render();}));
Promise.allSettled([getJSON('data.json'),getJSON('status.json')]).then(([data,state])=>{
  if(data.status==='fulfilled' && data.value.schemaVersion===1 && data.value.periods) snapshot=data.value;
  if(state.status==='fulfilled') status=state.value;
  try { render(); } catch { $('report').hidden=true; $('notice').textContent='集計データの形式を読み取れませんでした。更新後に再読み込みしてください。'; }
});
