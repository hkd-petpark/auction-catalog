
// ===== CSVパーサ（正規表現ゼロ・ダブルクオート対応・区切り自動判定・BOM/先頭空行スキップ） =====
function parseCSV(text) {
  text = text.split('\r\n').join('\n');
  text = text.split('\r').join('\n');
  if (text.length && text.charCodeAt(0) === 0xFEFF) { text = text.slice(1); }
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
        const trimmedRow = row.map(v => (v ?? '').trim());
        const hasAnyData = trimmedRow.some(v => v.length > 0);
        if (hasAnyData) rows.push(trimmedRow);
        row = []; field = '';
      } else { field += c; }
    }
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    const trimmedRow = row.map(v => (v ?? '').trim());
    const hasAnyData = trimmedRow.some(v => v.length > 0);
    if (hasAnyData) rows.push(trimmedRow);
  }
  const header = rows[0] || [];
  const data = rows.slice(1);
  return { header, data };
}

// ===== ヘッダー厳密チェック（5列は必須、画像URLは任意） =====
function ensureHeadersStrictRelaxed(header) {
  const required = ['種類','毛色','性別','生年月日','血統書団体名','仕切書No'];
  const normalized = header.map(h => (h ?? '').trim());
  const missing = required.filter(exp => !normalized.includes(exp));
  if (missing.length) {
    throw new Error('必須ヘッダーが不足しています:\n' + missing.map(m => `- ${m}`).join('\n'));
  }
  // 画像URLは任意なのでチェック不要
}

// ===== 3桁ゼロパディング No.001 =====
function toNo(n) { return `No.${String(n).padStart(3,'0')}`; }

// ===== 表示ユーティリティ =====
function textLine(label, value) {
  const div = document.createElement('div');
  div.textContent = value ? `${label}: ${value}` : `${label}: （未記入）`;
  return div;
}

// ===== カード生成（画像対応） =====
function createCard(item, no) {
  const card = document.createElement('div');
  card.className = 'card';



 // 画像（サムネイル）：画像URLがあればそれ、無ければ no-photo.png
const img = document.createElement('img');
  img.className = 'thumb';
  img.alt = item.species || 'thumbnail';
  img.style.width = '100%';
  img.style.aspectRatio = '4/3';
  img.style.objectFit = 'cover';
  card.appendChild(img);

onst body = document.createElement('div');
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
    textLine('血統書団体名', item.pedigreeOrg),
    textLine('仕切書No', item.shikishoNo),
  );

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const btn = document.createElement('a');
  btn.className = 'btn';
  btn.href = '#';
  btn.textContent = '詳細を見る';
  btn.addEventListener('click', (e) => { e.preventDefault(); openModal(item, toNo(no)); });
  footer.appendChild(btn);

  body.appendChild(title);
  body.appendChild(meta);
  card.appendChild(body);
  card.appendChild(footer);

  // 仕切書Noに一致する画像を自動解決
  (async () => {
    const resolved = await resolveImageByNo(item.shikishoNo);
    const src = resolved || 'images/no-photo.png';
    img.src = src;
    img.dataset.src = src;
    img.addEventListener('click', () => openLightbox(src));
  })();

   return card;
}


// ===== 詳細モーダル（画像URLも表示） =====
function openModal(item, noLabel) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  body.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = `${item.species || '(種類未記入)'} — ${noLabel}`;

  const table = document.createElement('table');
  table.className = 'detail-table';

  const rows = [
    ['種類', item.species],
    ['毛色', item.color],
    ['性別', item.sex],
    ['生年月日', item.birth],
    ['血統書団体名', item.pedigreeOrg],
    ['画像URL', item.image]
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

  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
}

function closeModal(){
  const modal = document.getElementById('modal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden','true');
}

// ===== 描画メイン（画像URLは任意列） =====
function renderFromCSV(text) {
  console.clear();
  const { header, data } = parseCSV(text);
  console.info('[診断] header =', header);
  console.info('[診断] data rows =', data.length);

  try {
    ensureHeadersStrictRelaxed(header); // 画像URLは任意
  } catch (err) {
    console.error('[診断] ヘッダーチェック:', err.message);
    alert(err.message);
    return;
  }

  const idx = {
    species: header.indexOf('種類'),
    color: header.indexOf('毛色'),
    sex: header.indexOf('性別'),
    birth: header.indexOf('生年月日'),
    pedigreeOrg: header.indexOf('血統書団体名'),
    shikishoNo: header.indexOf('仕切書No')
  };

  const items = data.map((row) => {
    const get = (j) => (j>=0 && j<row.length) ? (row[j] ?? '').trim() : '';
    return {
      species: get(idx.species),
      color:   get(idx.color),
      sex:     get(idx.sex),
      birth:   get(idx.birth),
      pedigreeOrg: get(idx.pedigreeOrg),
      shikishoNo:  get(idx.shikishoNo)
    };
  });

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  items.forEach((item, i) => { grid.appendChild(createCard(item, i+1)); });

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


// ▼ 1) 公開時は手動選択イベントを無効化（コメントアウト）
// const input = document.getElementById('csvInput');
// input.addEventListener('change', async (e) => {
//   const file = e.target.files[0];
//   if (!file) return;
//   const text = await file.text();
//   renderFromCSV(text);
// });


// ▼ 2) ページロード時に固定CSVを自動読み込み
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('animals.csv', { cache: 'no-store' }); // キャッシュ抑止（任意）
    if (!res.ok) throw new Error(`CSVの取得に失敗しました: ${res.status}`);
    const text = await res.text();
    renderFromCSV(text);
  } catch (err) {
    console.error('[公開版] CSV読込エラー:', err);
    alert('公開用CSV（animals.csv）の読み込みに失敗しました。配置とパスをご確認ください。');
  }
});

// ===== モーダル閉じる =====
const btnClose = document.getElementById('modalClose');
btnClose.addEventListener('click', closeModal);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });



// ===== ライトボックス（nullガード付き、安全初期化） =====
let lb = null;

function initLightbox() {
  // DOMから要素取得
  
  const el  = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImage');
  const btn = document.getElementById('lightboxClose');
  if (!el || !img || !btn) { console.error('[LB] 要素が見つかりません'); return; }

  lb = { el, img, btnClose: btn, zoom: 1.0 };

  // --- 既存のクローズ系イベント ---
  lb.el.addEventListener('click', (e) => { if (e.target === lb.el) closeLightbox(); }, { passive: true });
  lb.btnClose.addEventListener('click', closeLightbox, { passive: true });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  // --- （既存）ダブルクリックでズーム切替 ---
  lb.img.addEventListener('dblclick', () => {
    lbZoomTo(lb.zoom === 1.0 ? 1.5 : 1.0);
  });

  // --- ここからピンチズーム&パンの追加 ---
  // 変数（状態）
  let startDist = 0;       // ピンチ開始時の指の距離
  let startScale = 1;      // ピンチ開始時のスケール
  let scale = 1;           // 現在のスケール
  let offsetX = 0;         // 平行移動（パン）X
  let offsetY = 0;         // 平行移動（パン）Y
  let startMid = { x: 0, y: 0 };       // ピンチ中心（画面座標）
  let imgOrigin = { x: 0, y: 0 };      // 画像の原点（transform基準の微調整）
  let lastTouch = null;                 // 1本指ドラッグ用

  // transformをまとめて適用
  function applyTransform() {
    lb.img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  // UI操作でズームするときの共通処理
  function lbZoomTo(s, center = null) {
    const prev = scale;
    scale = Math.max(1.0, Math.min(s, 6.0)); // ズーム範囲：1.0～6.0
    // 中心指定がある場合：その点を基準にズーム（パン位置を補正）
    if (center) {
      const dx = center.x - imgOrigin.x - offsetX;
      const dy = center.y - imgOrigin.y - offsetY;
      // 新スケールで同じポイントが見えるようにオフセット補正
      offsetX -= dx * (scale / prev - 1);
      offsetY -= dy * (scale / prev - 1);
    }
    applyTransform();
  }

  // 2点間距離
  function distance(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }
  // 2点の中点
  function midpoint(a, b) {
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  // 画像の画面上の位置（左上）を取得（ズーム・パンの中心計算用）
  function computeImgOrigin() {
    const rect = lb.img.getBoundingClientRect();
    imgOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  // --- タッチ開始 ---
  lb.img.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      computeImgOrigin();                     // 現在の画像中心を記録
      const [t1, t2] = e.touches;
      startDist = distance(t1, t2);
      startScale = scale;
      startMid = midpoint(t1, t2);
    } else if (e.touches.length === 1) {
      e.preventDefault();
      lastTouch = e.touches[0];
    }
  }, { passive: false });

  // --- タッチ移動 ---
  lb.img.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const [t1, t2] = e.touches;
      const dist = distance(t1, t2);
      const mid = midpoint(t1, t2);
      if (startDist > 0) {
        const factor = dist / startDist;
        const targetScale = startScale * factor;
        lbZoomTo(targetScale, mid);           // 中点を基準にズーム
      }
    } else if (e.touches.length === 1 && lastTouch) {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - lastTouch.clientX;
      const dy = t.clientY - lastTouch.clientY;
      offsetX += dx;
      offsetY += dy;
      applyTransform();
      lastTouch = t;
    }
  }, { passive: false });

  // --- タッチ終了 ---
  lb.img.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      lastTouch = null;
      startDist = 0;
      startMid = { x: 0, y: 0 };
      startScale = scale;
    }
    // 1本指→2本指に移行/逆などの途中状態でも特別処理不要
  }, { passive: true });

  // スクロールでズーム（PC用）
  lb.img.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const factor = delta > 0 ? 0.9 : 1.1;     // 下スクロールで縮小、上で拡大
    lbZoomTo(scale * factor, { x: e.clientX, y: e.clientY });
  }, { passive: false });

  // 初期状態


  // nullガード：要素が無ければ初期化しない
  if (!el || !img || !btn) {
    console.error('[LB] 要素が見つかりません。index.htmlのライトボックスDOM配置とidを確認してください。');
    return;
  }

  // 参照を保持
  lb = { el, img, btnClose: btn, zoom: 1.0 };

  // 閉じるイベント
  lb.el.addEventListener('click', (e) => { if (e.target === lb.el) closeLightbox(); });
  lb.btnClose.addEventListener('click', closeLightbox);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  // ダブルクリックで簡易ズーム（1.0 ↔ 1.5）
  lb.img.addEventListener('dblclick', () => {
    lb.zoom = (lb.zoom === 1.0) ? 1.5 : 1.0;
    lb.img.style.transform = `scale(${lb.zoom})`;
  });

  console.info('[LB] 初期化完了');
}

function openLightbox(src) {
  if (!lb || !lb.img || !lb.el) {
    console.warn('[LB] まだ初期化されていません。DOMContentLoaded後にinitLightboxを呼びます。');
    return;
  }
  lb.zoom = 1.0;
  lb.img.style.transform = 'scale(1.0)';
  lb.img.src = src || '';
  lb.el.classList.add('show');
  lb.el.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  if (!lb || !lb.img || !lb.el) return;
  lb.el.classList.remove('show');
  lb.el.setAttribute('aria-hidden', 'true');
  lb.img.src = '';
}

// DOM構築完了後にライトボックスを初期化（最重要）
document.addEventListener('DOMContentLoaded', initLightbox);
