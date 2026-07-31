// 原本 HTML (include 実行後の実 DOM を再現) と dist の DOM 構造比較
import { parse, parseFragment, serialize } from 'parse5';
import { readFileSync } from 'node:fs';

const ORIG = 'kadoma-artfes.jp';
const DIST = 'dist';

const PAGES = ['index','kaf_info','kaf_mmg','kaf_marche','contest','contest2024',
               'contest_entry','media','2024gallery','kaf_support'];

const INCLUDES = {
  'include-header':  readFileSync(`${ORIG}/includeHTML/header.html`, 'utf8'),
  'include-menubar': readFileSync(`${ORIG}/includeHTML/menubar.html`, 'utf8'),
  'include-hbpinfo': readFileSync(`${ORIG}/includeHTML/hbpinfo.html`, 'utf8'),
  'include-footer':  readFileSync(`${ORIG}/includeHTML/footer.html`, 'utf8'),
};

const attr = (n, name) => n.attrs?.find(a => a.name === name)?.value;
const setAttr = (n, name, value) => {
  const a = n.attrs?.find(a => a.name === name);
  if (a) a.value = value; else n.attrs.push({ name, value });
};
const SITE = JSON.parse(readFileSync('src/data/site.json', 'utf8'));
const byPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const textNode = (v, parent) => ({ nodeName: '#text', value: String(v), parentNode: parent });

function* walk(node) {
  yield node;
  for (const c of node.childNodes ?? []) yield* walk(c);
}

// jQuery の $("#id").html(x) を再現: 文書順で最初の該当 div にだけ挿入
function simulateIncludes(doc) {
  const filled = new Set();
  for (const n of walk(doc)) {
    if (n.tagName === 'div') {
      const id = attr(n, 'id');
      if (id && INCLUDES[id] && !filled.has(id)) {
        filled.add(id);
        const frag = parseFragment(INCLUDES[id]);
        n.childNodes = frag.childNodes;
        frag.childNodes.forEach(c => c.parentNode = n);
      }
    }
  }
}

// data-loader.js の差し込み処理を再現 (本番でユーザーが見ている状態を作る)
function simulateDataLoader(doc) {
  for (const n of [...walk(doc)]) {
    if (!n.tagName) continue;
    const f = attr(n, 'data-field');
    if (f !== undefined) {
      const v = byPath(SITE, f);
      if (v !== undefined) n.childNodes = [textNode(v, n)];
    }
    const sf = attr(n, 'data-src-field');
    if (sf !== undefined) { const v = byPath(SITE, sf); if (v !== undefined) setAttr(n, 'src', v); }
    const hf = attr(n, 'data-href-field');
    if (hf !== undefined) { const v = byPath(SITE, hf); if (v !== undefined) setAttr(n, 'href', v); }
    const af = attr(n, 'data-alt-field');
    if (af !== undefined) { const v = byPath(SITE, af); if (v !== undefined) setAttr(n, 'alt', v); }
    if (attr(n, 'data-news-list') !== undefined) {
      const html = SITE.news.map(item => {
        const dt = `<dt>${item.date}<span>${item.category}</span></dt>`;
        const dd = item.link ? `<dd><a href="${item.link}">${item.text}</a></dd>` : `<dd>${item.text}</dd>`;
        return dt + dd;
      }).join('\n');
      const frag = parseFragment(html);
      n.childNodes = frag.childNodes;
      frag.childNodes.forEach(c => c.parentNode = n);
    }
  }
}

// 設計判断B: 2つ目以降の空 include-footer div は dist では出力しない → 原本側から除去して比較
function dropEmptyDuplicateFooters(doc) {
  // walk は先行順 = 文書順。文書順で 2 個目以降の include-footer を除去対象にする
  const footers = [...walk(doc)].filter(n => n.tagName === 'div' && attr(n, 'id') === 'include-footer');
  const toDrop = new Set(footers.slice(1));
  let dropped = 0;
  for (const n of [...walk(doc)]) {
    if (!n.childNodes) continue;
    const before = n.childNodes.length;
    n.childNodes = n.childNodes.filter(c => !toDrop.has(c));
    dropped += before - n.childNodes.length;
  }
  return dropped;
}

// include.js / data-loader.js の script を原本側から除去 (dist には存在しない)
function stripLoaderScripts(doc) {
  for (const n of walk(doc)) {
    if (!n.childNodes) continue;
    n.childNodes = n.childNodes.filter(c => {
      if (c.tagName !== 'script') return true;
      const src = attr(c, 'src') ?? '';
      return !(src.endsWith('include.js') || src.endsWith('data-loader.js'));
    });
  }
}

// 構造シグネチャ: タグ / id / class / src / href (テキストは別途比較)
function structure(node, out = [], depth = 0) {
  if (node.tagName) {
    const bits = [node.tagName];
    for (const k of ['id','class','src','href','data-field','data-src-field','data-href-field','data-alt-field']) {
      const v = attr(node, k);
      if (v !== undefined) bits.push(`${k}=${v}`);
    }
    out.push('  '.repeat(depth) + bits.join(' '));
  }
  for (const c of node.childNodes ?? []) structure(c, out, node.tagName ? depth + 1 : depth);
  return out;
}

function textContent(node, out = []) {
  if (node.nodeName === '#text') out.push(node.value);
  if (node.tagName === 'script' || node.tagName === 'style') return out; // 中身は別枠
  for (const c of node.childNodes ?? []) textContent(c, out);
  return out;
}
const normText = (arr) => arr.join(' ').replace(/\s+/g, ' ').trim();

function diffLines(a, b, label, page) {
  if (a.length !== b.length) {
    console.log(`  [${page}] ${label}: 行数差 ${a.length} vs ${b.length}`);
  }
  let shown = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 8; i++) {
    if (a[i] !== b[i]) {
      console.log(`  [${page}] ${label} 相違 @${i}:`);
      console.log(`    原本: ${a[i] ?? '(なし)'}`);
      console.log(`    新版: ${b[i] ?? '(なし)'}`);
      shown++;
    }
  }
  return a.join('\n') === b.join('\n');
}

let allOk = true;
for (const page of PAGES) {
  const origDoc = parse(readFileSync(`${ORIG}/${page}.html`, 'utf8'));
  const distDoc = parse(readFileSync(`${DIST}/${page}.html`, 'utf8'));
  simulateIncludes(origDoc);
  simulateDataLoader(origDoc);
  const droppedFooters = dropEmptyDuplicateFooters(origDoc);
  stripLoaderScripts(origDoc);
  if (droppedFooters) console.log(`     (${page}: 空の重複 include-footer div ${droppedFooters} 個を比較から除外 = 設計判断B)`);

  const sOrig = structure(origDoc);
  const sDist = structure(distDoc);
  const structOk = sOrig.join('\n') === sDist.join('\n');

  // 意図した修正 (フッター組織名の誤記是正) を織り込んだ上で完全一致を要求
  const tOrig = normText(textContent(origDoc)).replaceAll('門真市文化芸術活動推進基本計画', '門真市文化芸術推進基本計画');
  const tDist = normText(textContent(distDoc));
  const textOk = tOrig === tDist;

  if (structOk && textOk) {
    console.log(`OK   ${page}: DOM構造一致 / テキスト一致`);
  } else {
    console.log(`DIFF ${page}: 構造${structOk ? '一致' : '相違'} / テキスト${textOk ? '一致' : '相違'}`);
    if (!structOk) { diffLines(sOrig, sDist, '構造', page); allOk = false; }
    if (!textOk) {
      // テキスト相違の位置を特定
      const wo = tOrig.split(' '), wd = tDist.split(' ');
      let i = 0; while (i < Math.min(wo.length, wd.length) && wo[i] === wd[i]) i++;
      console.log(`    テキスト分岐点: 原本「…${wo.slice(i, i+8).join(' ')}…」 / 新版「…${wd.slice(i, i+8).join(' ')}…」`);
      allOk = false;
    }
  }
}
process.exit(0);
