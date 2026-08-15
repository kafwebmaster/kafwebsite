// content.js のマッピングを microCMS のモック応答で検証する
//
// 実行: node scripts/test-content-mapping.mjs
// 目的: microCMS (フィールドID 20 文字制限で短縮した平坦な形) からの応答が、
//        site.json と同じ入れ子構造に正しく復元されることを、実キー無しで保証する
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mapSiteSettings, mapNews, mapSponsors, mapArchives } from '../src/lib/content.js';

const local = JSON.parse(fs.readFileSync('src/data/site.json', 'utf8'));

// --- 1. site-settings: 全 45 フィールドを埋めたモック応答 ---
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
const mock = {};
for (const [section, obj] of Object.entries(local)) {
    if (section === 'news' || section === 'sponsors') continue;
    for (const [key, value] of Object.entries(obj)) {
        const cmsId = RENAMES[`${section}.${key}`] ?? `${section}_${key}`;
        if (section === 'images' || cmsId === 'contest_entryPdf') {
            // メディアは { url } オブジェクトで返る
            mock[cmsId] = { url: `https://images.microcms-assets.io/x/${key}.jpg`, width: 100, height: 100 };
        } else if (cmsId === 'contest_status') {
            mock[cmsId] = [value]; // select は配列
        } else {
            mock[cmsId] = value;
        }
    }
}

// 1-a: マニフェストありの場合 → ローカルパスに解決
const manifest = Object.fromEntries(
    Object.keys(mock).filter(k => k.startsWith('images_') || k === 'contest_entryPdf')
        .map(k => [mock[k].url, `/cms-assets/${k}.bin`])
);
const mapped = mapSiteSettings(mock, local, manifest);
for (const [section, obj] of Object.entries(local)) {
    if (section === 'news' || section === 'sponsors' || section === 'images') continue;
    if (section === 'contest') {
        const { entryPdf, ...rest } = obj;
        for (const k of Object.keys(rest)) assert.equal(mapped.contest[k], obj[k], `contest.${k}`);
        assert.equal(mapped.contest.entryPdf, '/cms-assets/contest_entryPdf.bin');
        continue;
    }
    assert.deepEqual(mapped[section], obj, section);
}
for (const k of Object.keys(local.images)) {
    assert.ok(String(mapped.images[k]).startsWith('/cms-assets/'), `images.${k} はミラーパスのはず`);
}
console.log('OK 1: 全項目入力 + マニフェストあり → site.json と同形 / メディアはローカルパス');

// 1-b: CMS 未入力フィールドはローカル値へフォールバック
const partial = { edition_name: 'テスト大会名' };
const mapped2 = mapSiteSettings(partial, local, {});
assert.equal(mapped2.edition.displayName, 'テスト大会名');
assert.equal(mapped2.edition.displayNameShort, local.edition.displayNameShort);
assert.equal(mapped2.images.flyerFront, local.images.flyerFront);
assert.equal(mapped2.contest.entryPdf, local.contest.entryPdf);
console.log('OK 2: 部分入力 → 未入力はローカル値でフォールバック');

// --- 2. news ---
const newsMock = local.news.map(n => ({
    date: n.date, category: [n.category], text: n.text, link: n.link ?? '',
}));
assert.deepEqual(mapNews(newsMock), local.news);
console.log('OK 3: news → select 配列の展開・空リンクの null 化を含め同形');

// --- 3. sponsors ---
const sponsorsMock = local.sponsors.map(s => ({ name: s.name }));
assert.deepEqual(mapSponsors(sponsorsMock), local.sponsors);
// order 指定は登録順に優先する
const ordered = mapSponsors([
    { name: 'B' }, { name: 'A', order: 1 }, { name: 'C', order: 2 },
]);
assert.deepEqual(ordered.map(s => s.name), ['A', 'C', 'B']);
console.log('OK 4: sponsors → 登録順維持 / order 指定は優先');

// --- 4. FIELD_MAP に無いキー (JSON のみで管理) のパススルー ---
// siteText や contest の配列項目は CMS 側にフィールドが無いため、
// CMS 応答が空でも site.json の値がそのまま通ること
const mapped3 = mapSiteSettings({}, local, {});
assert.deepEqual(mapped3.siteText, local.siteText, 'siteText はローカル値のまま');
assert.deepEqual(mapped3.contest.rules, local.contest.rules, 'contest.rules はローカル値のまま');
assert.deepEqual(mapped3.contest.eligibility, local.contest.eligibility, 'contest.eligibility はローカル値のまま');
assert.equal(mapped3.contest.editionName, local.contest.editionName);
assert.equal(mapped3.contest.entryFee, local.contest.entryFee);
console.log('OK 5: FIELD_MAP に無いキー → site.json の値をパススルー');

console.log('\n全テスト合格');

// --- 4. archives (mapArchives) ---
const A = (year, title, galleryCount, publishedAt, extra = {}) => ({
    year, title, publishedAt,
    dateRange: `${year}年開催`, description: `${title} の記録`,
    heroImage: { url: `https://images.microcms-assets.io/assets/svc/hero${year}/hero.jpg` },
    gallery: Array.from({ length: galleryCount }, (_, i) =>
        ({ url: `https://images.microcms-assets.io/assets/svc/g${year}-${i}/p.jpg` })),
    ...extra,
});
const rawArchives = [
    A(2024, 'KADOMA ART FES 4', 3, '2026-08-01T00:00:00Z'),
    A(2026, 'KADOMA ART FES 5', 2, '2026-08-02T00:00:00Z'),
    A(2027, 'KADOMA ART FES 6', 0, '2026-08-03T00:00:00Z'),          // 写真ゼロ → 除外
    A(2024, '重複の古い方', 5, '2025-01-01T00:00:00Z'),               // year 重複 (古い) → 除外
    A(2026.5, '小数year', 2, '2026-08-01T00:00:00Z'),                 // 非整数 → 除外
];
const mappedA = mapArchives(rawArchives);
assert.deepEqual(mappedA.map(a => a.year), [2026, 2024], 'year 降順・無効エントリ除外');
assert.equal(mappedA[1].title, 'KADOMA ART FES 4', '重複は公開が新しい方を採用');
assert.equal(mappedA[0].gallery.length, 2);
assert.ok(mappedA[0].heroImage.startsWith('https://'), 'マニフェスト無しでは CMS URL のまま');
// マニフェスト解決
const aManifest = { 'https://images.microcms-assets.io/assets/svc/hero2026/hero.jpg': '/cms-assets/archive/2026/hero.jpg' };
const mappedA2 = mapArchives(rawArchives, aManifest);
assert.equal(mappedA2[0].heroImage, '/cms-assets/archive/2026/hero.jpg');
console.log('OK 6: archives → 降順ソート / 写真ゼロ・重複・非整数の除外 / マニフェスト解決');

console.log('\n全テスト合格 (archives 含む)');
