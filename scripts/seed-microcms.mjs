// microCMS へ初期コンテンツを一括投入するスクリプト (原則 1 回きりの使用)
//
// 投入対象:
//   - site-settings … テキスト/数値/セレクトの 36 項目 (画像 8 + PDF 1 は対象外。
//                      メディアは管理画面から手動アップロードする)
//   - news          … 7 件 (表示順を保つため古いものから順に登録)
//   - sponsors      … 34 件 (現行サイトの掲載順に登録)
//
// 使い方:
//   MICROCMS_SERVICE_DOMAIN=kadoma-artfes MICROCMS_WRITE_KEY=... \
//     node scripts/seed-microcms.mjs --yes
//
// 安全設計:
//   - --yes を付けない限り何も書き込まない (投入内容のプレビューのみ表示)
//   - 書き込みキー (POST/PATCH 権限) は投入直前に発行し、完了後すぐ削除すること
//   - 既にコンテンツがある API への二重投入を防ぐため、投入前に件数を確認する
import fs from 'node:fs';
import path from 'node:path';

const DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN;
const KEY = process.env.MICROCMS_WRITE_KEY;
const YES = process.argv.includes('--yes');

if (!DOMAIN || !KEY) {
    console.error('環境変数 MICROCMS_SERVICE_DOMAIN と MICROCMS_WRITE_KEY を設定してください');
    process.exit(1);
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

// site-settings: メディア系以外の 36 項目 (docs/microcms-schema.md の対応表と同期)
const RENAMES = {
    'edition.displayName': 'edition_name',
    'edition.displayNameShort': 'edition_nameShort',
    'edition.displayNameCompact': 'edition_nameCompact',
    'edition.fiscalYearLabel': 'edition_fiscalYear',
    'contest.entryDeadline': 'contest_deadlineFull',
    'contest.entryDeadlineShort': 'contest_deadline',
    'contest.exhibitionPeriod': 'contest_exhibPeriod',
    'contest.exhibitionPeriodFull': 'contest_exhibFull',
    'contest.deliveryPeriod': 'contest_delivery',
    'images.entryThumbnail': 'images_entryThumb',
    'marche.displayName': 'marche_name',
};
const settings = {};
for (const [section, obj] of Object.entries(site)) {
    if (section === 'news' || section === 'sponsors' || section === 'images') continue;
    for (const [key, value] of Object.entries(obj)) {
        const cmsId = RENAMES[`${section}.${key}`] ?? `${section}_${key}`;
        if (cmsId === 'contest_entryPdf') continue; // ファイルは手動アップロード
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

if (!YES) {
    console.log('\n--yes が指定されていないため書き込みは行いません (プレビューのみ)');
    console.log(JSON.stringify({ settings, news: newsToPost.slice(0, 2), sponsors: sponsorsToPost.slice(0, 2) }, null, 2).slice(0, 1500));
    process.exit(0);
}

// --- 二重投入ガード ---
for (const ep of ['news', 'sponsors']) {
    const cur = await api('GET', ep, null, '?limit=0');
    if (cur?.totalCount > 0) {
        console.error(`中止: ${ep} に既に ${cur.totalCount} 件のコンテンツがあります (二重投入防止)`);
        process.exit(1);
    }
}

// --- 実行 ---
console.log('\n[1/3] site-settings を投入...');
await api('PATCH', 'site-settings', settings);
console.log('  完了');

console.log('[2/3] news を投入 (7件・古い順)...');
for (const n of newsToPost) {
    await api('POST', 'news', n);
    console.log(`  + ${n.date} ${n.text.slice(0, 24)}...`);
}

console.log('[3/3] sponsors を投入 (34件)...');
for (const s of sponsorsToPost) {
    await api('POST', 'sponsors', s);
}
console.log('  完了');

console.log('\n投入がすべて完了しました。');
console.log('⚠️ このスクリプトに使った書き込みキーは、いますぐ microCMS 側で削除(または権限を GET のみに戻す)してください。');
