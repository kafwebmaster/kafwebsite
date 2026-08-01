// content.js のマッピングを microCMS のモック応答で検証する
//
// 実行: node scripts/test-content-mapping.mjs
// 目的: microCMS (フィールドID 20 文字制限で短縮した平坦な形) からの応答が、
//        site.json と同じ入れ子構造に正しく復元されることを、実キー無しで保証する
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mapSiteSettings, mapNews, mapSponsors } from '../src/lib/content.js';

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
        .map(k => [k, `/cms-assets/${k}.bin`])
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

console.log('\n全テスト合格');
