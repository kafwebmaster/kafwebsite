// microCMS へ初期コンテンツを一括投入するスクリプト (原則 1 回きりの使用)
//
// 投入対象:
//   - site-settings … テキスト/数値/セレクトの 36 項目 (画像 8 + PDF 1 は対象外。
//                      メディアは管理画面から手動アップロードする)
//   - news          … 7 件 (表示順を保つため古いものから順に登録)
//   - sponsors      … 34 件 (現行サイトの掲載順に登録)
//
// 使い方は 2 通り。
//
// (A) Cloudflare のビルド内で実行する【推奨・キーを外部に出さない】
//     無料プランは API キーを 1 個しか作れないため、投入専用キーを別途発行できない。
//     そこで Cloudflare に既に設定済みの MICROCMS_API_KEY をそのまま使い、
//     ビルド中に 1 回だけ投入する。
//       1. microCMS: 既存キーに POST / PATCH 権限を一時的に付与
//       2. Cloudflare: 環境変数 SEED_MICROCMS = 1 を追加
//       3. Cloudflare: Retry deployment (このスクリプトがビルド前に実行される)
//       4. Cloudflare: SEED_MICROCMS を削除
//       5. microCMS: POST / PATCH 権限を外して GET のみに戻す
//
// (B) 手元で実行する
//     MICROCMS_SERVICE_DOMAIN=kadoma-artfes MICROCMS_WRITE_KEY=... \
//       node scripts/seed-microcms.mjs --yes
//
// 安全設計:
//   - 実行の合図 (--yes または SEED_MICROCMS=1) が無ければ一切書き込まない
//   - 既にコンテンツがある API への二重投入を防ぐため、投入前に件数を確認する
//   - 通常のビルドでは何もしない (SEED_MICROCMS が無ければ即終了)
import fs from 'node:fs';
import path from 'node:path';
import { FIELD_MAP } from '../src/lib/content.js';

const DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN;
// 投入専用キーがあればそれを、無ければビルド環境の読み取りキーを使う (方式A)
const KEY = process.env.MICROCMS_WRITE_KEY || process.env.MICROCMS_API_KEY;
const SEED_FLAG = process.env.SEED_MICROCMS === '1';
const PREVIEW = process.argv.includes('--preview');
const YES = process.argv.includes('--yes') || SEED_FLAG;

// 通常のビルドでは何もしない。
// build スクリプトの先頭に置かれているため、ここで確実に無害に抜けること。
if (!YES && !PREVIEW) {
    process.exit(0);
}

if (!DOMAIN || !KEY) {
    // 投入を指示されたのに接続情報が無い場合もビルドは止めない
    console.warn('[seed] MICROCMS_SERVICE_DOMAIN / API キーが未設定のため投入をスキップします');
    process.exit(0);
}

const site = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'src/data/site.json'), 'utf8'));

const api = async (method, endpoint, body, query = '') => {
    const res = await fetch(`https://${DOMAIN}.microcms.io/api/v1/${endpoint}${query}`, {
        method,
        headers: { 'X-MICROCMS-API-KEY': KEY, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${method} ${endpoint}: HTTP ${res.status} ${text}`);
    }
    return res.status === 204 ? null : res.json().catch(() => null);
};

// --- 投入データの組み立て ---

// site-settings: メディア系以外の 36 項目。
// FIELD_MAP (= 実際に microCMS に存在するフィールドの対応表) を正として組み立てる。
// site.json にしか無いキー (siteText や contest の配列項目など) は CMS に
// フィールドが無いため、ここには含めない (存在しないフィールドへの PATCH は 400 になる)。
const settings = {};
for (const [section, fields] of Object.entries(FIELD_MAP)) {
    if (section === 'images') continue; // メディアは手動アップロード
    for (const [key, cmsId] of Object.entries(fields)) {
        if (cmsId === 'contest_entryPdf') continue; // ファイルは手動アップロード
        const value = site[section]?.[key];
        if (value === undefined) continue;
        settings[cmsId] = cmsId === 'contest_status' ? [value] : value;
    }
}

// news: 表示順 = site.json の並び。既定ソート (公開が新しい順) で再現するため
// 逆順 (古いものから) に登録する
const newsToPost = [...site.news].reverse().map((n) => ({
    date: n.date,
    category: [n.category], // セレクトは配列で渡す
    text: n.text,
    ...(n.link ? { link: n.link } : {}),
}));

// sponsors: 掲載順に登録 (取得側は登録順 = 公開日時昇順で並べる)
const sponsorsToPost = site.sponsors.map((s) => ({ name: s.name }));

console.log(`投入先: https://${DOMAIN}.microcms.io/`);
console.log(`  site-settings: ${Object.keys(settings).length} 項目 (メディア除く)`);
console.log(`  news: ${newsToPost.length} 件 (古い順に登録)`);
console.log(`  sponsors: ${sponsorsToPost.length} 件`);

if (PREVIEW && !YES) {
    console.log('\n--preview のため書き込みは行いません');
    console.log(JSON.stringify({ settings, news: newsToPost.slice(0, 2), sponsors: sponsorsToPost.slice(0, 2) }, null, 2).slice(0, 1500));
    process.exit(0);
}

// 3 ステップは互いに独立して実行する。
// 1 つが失敗しても残りを続行し、最後に成否の一覧を表示する
// (前回、site-settings の失敗で news / sponsors まで未投入になった反省)。
// ビルド内実行 (方式A) ではどの失敗でもビルドは止めない。
const results = [];

// [1/3] site-settings (オブジェクト形式は PATCH のみ。
//        管理画面で一度「下書き保存」されていないと "Content is not exists" になる)
console.log('\n[1/3] site-settings を投入...');
try {
    await api('PATCH', 'site-settings', settings);
    results.push(['site-settings', 'OK', `${Object.keys(settings).length} 項目`]);
    console.log('  完了');
} catch (e) {
    results.push(['site-settings', 'FAIL', e.message]);
    console.warn(`  失敗: ${e.message}`);
    if (String(e.message).includes('Content is not exists')) {
        console.warn('  → microCMS 管理画面で「サイト設定」を開き、空のまま「下書き保存」してから再実行してください');
    }
}

// [2/3] news (二重投入ガード付き)
console.log('[2/3] news を投入 (7件・古い順)...');
try {
    const cur = await api('GET', 'news', null, '?limit=0');
    if (cur?.totalCount > 0) {
        results.push(['news', 'SKIP', `既に ${cur.totalCount} 件あり (二重投入防止)`]);
        console.warn(`  スキップ: 既に ${cur.totalCount} 件あります`);
    } else {
        for (const n of newsToPost) {
            await api('POST', 'news', n);
            console.log(`  + ${n.date} ${n.text.slice(0, 24)}...`);
        }
        results.push(['news', 'OK', `${newsToPost.length} 件`]);
    }
} catch (e) {
    results.push(['news', 'FAIL', e.message]);
    console.warn(`  失敗: ${e.message}`);
}

// [3/3] sponsors (二重投入ガード付き)
console.log('[3/3] sponsors を投入 (34件)...');
try {
    const cur = await api('GET', 'sponsors', null, '?limit=0');
    if (cur?.totalCount > 0) {
        results.push(['sponsors', 'SKIP', `既に ${cur.totalCount} 件あり (二重投入防止)`]);
        console.warn(`  スキップ: 既に ${cur.totalCount} 件あります`);
    } else {
        for (const s of sponsorsToPost) {
            await api('POST', 'sponsors', s);
        }
        results.push(['sponsors', 'OK', `${sponsorsToPost.length} 件`]);
        console.log('  完了');
    }
} catch (e) {
    results.push(['sponsors', 'FAIL', e.message]);
    console.warn(`  失敗: ${e.message}`);
}

// --- 結果サマリ ---
console.log('\n[seed] ===== 投入結果 =====');
for (const [ep, status, detail] of results) {
    console.log(`[seed]   ${status.padEnd(4)} ${ep}: ${detail}`);
}
const allOk = results.every(([, s]) => s === 'OK' || s === 'SKIP');
if (allOk) {
    console.log('[seed] 投入がすべて完了しました。');
    console.log('[seed] ⚠️ 次の 2 つを必ず実施してください:');
    console.log('[seed]   1. Cloudflare の環境変数 SEED_MICROCMS を削除する');
    console.log('[seed]   2. microCMS の API キーから POST / PATCH 権限を外し GET のみに戻す');
} else {
    console.warn('[seed] 一部が失敗しました。上記の指示に従い再実行してください (成功分は二重投入ガードで保護されます)');
}
if (!SEED_FLAG && !allOk) process.exit(1);
