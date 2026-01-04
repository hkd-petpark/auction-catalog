

// ===== CSVパーサ（BOM・改行揃え・区切り自動・ダブルクオート対応） =====
function parseCSV(text) {
  // 改行正規化
  text = text.split('\r\n').join('\n');
  text = text.split('\r').join('\n');

  // BOM除去（UTF-8先頭の不可視文字）
  if (text.length && text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const lines = text.split('\n');
  while (lines.length && lines[0].trim().length === 0) { lines.shift(); }
  text = lines.join('\n');

  const firstLine = text.split('\n')[0] || '';
  const commaCount = (firstLine.split(',').length - 1);
  const semiCount  = (firstLine.split(';').length - 1);
  const SEP = semiCount > commaCount ? ';' : ',';

  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === SEP) { row.push(field); field = ''; }
      else if (c === '\n') {
        row.push(field);
        const trimmed = row.map(v => (v ?? '').trim());
        if (trimmed.some(v => v.length > 0)) rows.push(trimmed);
        row = []; field = '';
      } else { field += c; }
    }
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    const trimmed = row.map(v => (v ?? '').trim());
    if (trimmed.some(v => v.length > 0)) rows.push(trimmed);
  }

  const header = rows[0] || [];
  const data   = rows.slice(1);
  return { header, data };
}


// ===== ヘッダー厳密チェック（6列のみ必須） =====
function ensureHeadersStrictRelaxed(header){
  const required = ['種類','毛色','性別','生年月日','血統書団体名','仕切書No'];
  const normalized = header.map(h => (h ?? '').trim());
  const missing = required.filter(exp => !normalized.includes(exp));
  if (missing.length) {
    throw new Error('必須ヘッダーが不足しています:
' + missing.map(m => `- ${m}`).join('\n'));
  }
}

// 欠点項目のヘッダー名（任意）
const DEFECT_FIELDS = [
  '体重','毛質','耳','ペコ','目','鼻','嚙み合わせ','門歯歯列',
  'デベソ','ヘルニア','狼爪','尾','パテラ左','パテラ右','胸','心雑','その他（ミスカラーなど)'
];

function toNo(n){ return `No.${String(n).padStart(3,'0')}`; }
function textLine(label, value){
  const div = document.createElement('div');
  div.textContent = value ? `${label}: ${value}` : `${label}: （未入力）`;
  return div;
}

// ===== 画像ファイルの自動解決（仕切書No一致） =====
async function resolveImageByNo(no){
  if (!no) return null;
  const base = `images/${no}`;
  for (const ext of ['jpg','png','webp']){
    const url = `${base}.${ext}`;
    try {
      const res = await fetch(url, { method:'HEAD', cache:'no-store' });
      if (res.ok) return url;
    } catch(e){ /* ignore */ }
  }
  return null;
}

// ===== カード生成 =====
function createCard(item, no){
  const card = document.createElement('div');
  card.className = 'card';

  const img = document.createElement('img');
  img.className = 'thumb';
  img.alt = item.species || 'thumbnail';
  img.style.width = '100%';
  img.style.aspectRatio = '4/3';
  img.style.objectFit = 'cover';
  card.appendChild(img);

  const body = document.createElement('div');
  body.className = 'card-body';
  const title = document.createElement('div');
  title.className = 'card-title';
  const h3 = document.createElement('h3');
  h3.textContent = item.species || '（種類未入力）';
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = toNo(no);
  title.appendChild(h3);
  title.appendChild(badge);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.append(
    textLine('毛色', item.color),
    textLine('性別', item.sex),
    textLine('生年月日', item.birth),
    textLine('血統書団体名', item.pedigreeOrg)
  );

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const btn = document.createElement('a');
  btn.className = 'btn';
  btn.href = '#';
  btn.textContent = '詳細を見る';
  btn.addEventListener('click', (e)=>{ e.preventDefault(); openModal(item, toNo(no)); });
  footer.appendChild(btn);

  body.appendChild(title);
  body.appendChild(meta);
  card.appendChild(body);
  card.appendChild(footer);

  // 画像は renderFromCSV で解決済みを使う（なければ描画されていない前提）
  const src = item._image;
  img.src = src;
  img.dataset.src = src;
  img.addEventListener('click', () => openLightbox(src));

  return card;
}

// ===== 詳細モーダル =====
function openModal(item, noLabel){
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  body.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = `${item.species || '（種類未入力）'} — ${noLabel}`;

  const table = document.createElement('table');
  table.className = 'detail-table';
  const rows = [
    ['種類', item.species],
    ['毛色', item.color],
    ['性別', item.sex],
    ['生年月日', item.birth],
    ['血統書団体名', item.pedigreeOrg]
  ].filter(r => r[1] != null && r[1] !== '');

  rows.forEach(([k,v]) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.textContent = k;
    const td = document.createElement('td'); td.textContent = v;
    tr.appendChild(th); tr.appendChild(td);
    table.appendChild(tr);
  });

  body.appendChild(title);
  body.appendChild(table);

  // 欠点情報セクション（空白は表示しない）
  const defects = item.defects || {};
  const nonEmpty = Object.entries(defects).filter(([k,v]) => (v ?? '').trim().length > 0);
  if (nonEmpty.length > 0) {
    const h3 = document.createElement('h3');
    h3.textContent = '欠点情報';
    h3.style.marginTop = '16px';
    body.appendChild(h3);

    const dtable = document.createElement('table');
    dtable.className = 'detail-table';
    nonEmpty.forEach(([k,v]) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.textContent = k;
      const td = document.createElement('td'); td.textContent = v;
      tr.appendChild(th); tr.appendChild(td);
      dtable.appendChild(tr);
    });
    body.appendChild(dtable);
  }

  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
}
function closeModal(){
  const modal = document.getElementById('modal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden','true');
}

// ===== 描画メイン（写真なし除外＆欠点取り込み） =====
async function renderFromCSV(text){
  const { header, data } = parseCSV(text);
  try { ensureHeadersStrictRelaxed(header); }
  catch(err){ alert(err.message); return; }

  // 基本インデックス
  const idx = {
    species: header.indexOf('種類'),
    color: header.indexOf('毛色'),
    sex: header.indexOf('性別'),
    birth: header.indexOf('生年月日'),
    pedigreeOrg: header.indexOf('血統書団体名'),
    shikishoNo: header.indexOf('仕切書No')
  };

  // 欠点インデックス
  const defectIdx = {};
  DEFECT_FIELDS.forEach(name => { defectIdx[name] = header.indexOf(name); });

  // CSV → item（欠点も詰める）
  const rawItems = data.map(row => {
    const get = (j) => (j>=0 && j<row.length) ? (row[j] ?? '').trim() : '';

    const item = {
      species: get(idx.species),
      color: get(idx.color),
      sex: get(idx.sex),
      birth: get(idx.birth),
      pedigreeOrg: get(idx.pedigreeOrg),
      shikishoNo: get(idx.shikishoNo)
    };

    const defects = {};
    for (const name of DEFECT_FIELDS) {
      const j = defectIdx[name];
      defects[name] = get(j);
    }
    item.defects = defects;

    return item;
  });

  // 画像存在解決
  const resolvedImages = await Promise.all(
    rawItems.map(it => resolveImageByNo(it.shikishoNo))
  );

  // 写真があるものだけ描画
  const items = rawItems
    .map((it, i) => ({ ...it, _image: resolvedImages[i] }))
    .filter(it => it._image != null);

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  items.forEach((item, i) => {
    grid.appendChild(createCard(item, i + 1));
  });

  const search = document.getElementById('search');
  search.oninput = () => {
    const q = search.value.toLowerCase();
    [...grid.children].forEach((card, i) => {
      const it = items[i];
      const text = [it.species, it.color, it.sex, it.birth, it.pedigreeOrg]
        .filter(Boolean).join(' ').toLowerCase();
      card.style.display = text.includes(q) ? '' : 'none';
    });
  };
}

// 公開モード: 固定CSV自動読み込み
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('animals.csv', { cache:'no-store' });
    if (!res.ok) throw new Error(`CSVの取得に失敗しました: ${res.status}`);
    const text = await res.text();
    renderFromCSV(text);
  } catch(err) {
    alert('公開用CSV（animals.csv）の読み込みに失敗しました。配置をご確認ください。');
  }
});

// モーダル閉じる
document.getElementById('modalClose').addEventListener('click', closeModal);
window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeModal(); });

// ライトボックス（簡易）
let lb = null;
function initLightbox(){
  const el = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImage');
  const btn = document.getElementById('lightboxClose');
  lb = { el, img, btnClose: btn, zoom: 1.0 };
  lb.el.addEventListener('click', (e)=>{ if (e.target === lb.el) closeLightbox(); });
  lb.btnClose.addEventListener('click', closeLightbox);
  window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeLightbox(); });
  lb.img.addEventListener('dblclick', ()=>{ lb.zoom = (lb.zoom===1.0)?1.5:1.0; lb.img.style.transform = `scale(${lb.zoom})`; });
}
function openLightbox(src){
  if (!lb) return;
  lb.zoom = 1.0; lb.img.style.transform = 'scale(1.0)'; lb.img.src = src || '';
  lb.el.classList.add('show'); lb.el.setAttribute('aria-hidden','false');
}
function closeLightbox(){ if (!lb) return; lb.el.classList.remove('show'); lb.el.setAttribute('aria-hidden','true'); lb.img.src=''; }

document.addEventListener('DOMContentLoaded', initLightbox);
