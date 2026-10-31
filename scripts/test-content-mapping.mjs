// content.js のマッピングを microCMS のモック応答で検証する
//
// 実行: node scripts/test-content-mapping.mjs
// 目的: microCMS (フィールドID 20 文字制限で短縮した平坦な形) からの応答が、
//        site.json と同じ入れ子構造に正しく復元されることを、実キー無しで保証する
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mapSiteSettings, mapNews, mapSponsors, mapArchives, mergeEditions, shortNameOf, slugOf, editionNumberOf, toTextArea, parseRules } from '../src/lib/content.js';

const local = JSON.parse(fs.readFileSync('src/data/site.json', 'utf8'));

// --- 1. site-settings: FIELD_MAP の全フィールドを埋めたモック応答 ---
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
    // KAF7 対応で追加したフィールド
    'contest.entryPeriodNotes': 'contest_periodNotes',
    'contest.entryFeeNotes': 'contest_feeNotes',
    'contest.docNotesOnline': 'contest_docNotesOnl',
    'contest.exhibitIntro': 'contest_exhibIntro',
    'siteText.intro': 'site_introText',
    'siteText.mainEvent': 'site_mainEvent',
    'mmg.contents': 'event_contents',
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
            // 配列・規約は管理画面と同じテキストエリア表記 (1 行 1 項目 / ◆見出し) にして渡す
            mock[cmsId] = toTextArea(cmsId, value);
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
        for (const k of Object.keys(rest)) assert.deepEqual(mapped.contest[k], obj[k], `contest.${k}`);
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

// --- 4-b. テキストエリア → 配列 / 規約の変換 (KAF7 で追加した CMS フィールド) ---
const ta = mapSiteSettings({
    contest_eligibility: '・一行目\n\n  ・二行目 (前後の空白は除く)  \r\n・三行目\n',
    contest_rules: '◆出品に関して\n１．条文A\n２．条文B\n\n◆作品に関して\n３．条文C',
    event_contents: '項目1\n項目2',
}, local, {});
assert.deepEqual(ta.contest.eligibility, ['・一行目', '・二行目 (前後の空白は除く)', '・三行目'], '空行を無視し前後空白を除いて 1 行 1 項目');
assert.deepEqual(ta.contest.rules, [
    { heading: '◆出品に関して', items: ['１．条文A', '２．条文B'] },
    { heading: '◆作品に関して', items: ['３．条文C'] },
], '◆ 行を見出しに規約を組み立てる');
assert.deepEqual(ta.mmg.contents, ['項目1', '項目2']);
assert.deepEqual(ta.contest.judging, local.contest.judging, '未入力の配列フィールドはローカル値');
// 空文字・空白のみはローカル値へ
const blank = mapSiteSettings({ contest_eligibility: '  \n ', contest_rules: '' }, local, {});
assert.deepEqual(blank.contest.eligibility, local.contest.eligibility, '空白のみ → ローカル値');
assert.deepEqual(blank.contest.rules, local.contest.rules, '空文字 → ローカル値');
// 先頭が ◆ でない規約は想定外としてローカル値へ
const bad = mapSiteSettings({ contest_rules: '１．見出しなしで始まる' }, local, {});
assert.deepEqual(bad.contest.rules, local.contest.rules, '見出しなしの規約 → ローカル値');
assert.equal(parseRules('１．見出しなし'), undefined);
// site.json → テキストエリア → 配列 の往復で元に戻ること (投入スクリプトの正しさ)。
// フォールバック側を汚染して渡し、「CMS 値が採用された結果」として一致することを保証する
const polluted = JSON.parse(JSON.stringify(local));
for (const key of Object.keys(polluted.contest)) if (Array.isArray(polluted.contest[key])) polluted.contest[key] = ['__X__'];
polluted.mmg.contents = ['__X__'];
for (const [section, fields] of Object.entries({ contest: ['intro','entryPeriodNotes','entryFeeNotes','eligibility','judging','awards','entryNotes','docNotes','docNotesOnline','rules','mailingAddr','bankInfo'], mmg: ['contents'] })) {
    for (const key of fields) {
        const cmsId = RENAMES[`${section}.${key}`] ?? `${section}_${key}`;
        const round = mapSiteSettings({ [cmsId]: toTextArea(cmsId, local[section][key]) }, polluted, {});
        assert.deepEqual(round[section][key], local[section][key], `${section}.${key} の往復 (CMS 値が採用されること)`);
    }
}
// 文字列フィールドの空文字は「未入力」と同じくローカル値へ
const emptyStr = mapSiteSettings({ contest_editionName: '', edition_name: '   ', site_introText: '' }, local, {});
assert.equal(emptyStr.contest.editionName, local.contest.editionName, '空文字 → ローカル値');
assert.equal(emptyStr.edition.displayName, local.edition.displayName, '空白のみ → ローカル値 (既存フィールドも同様)');
assert.equal(emptyStr.siteText.intro, local.siteText.intro);
console.log('OK 5b: テキストエリア → 配列/規約の変換、空・想定外はローカル値、往復一致');

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
    A(2027, 'KADOMA ART FES 7', 0, '2026-08-03T00:00:00Z'),          // 写真ゼロ → 除外
    A(2024, 'KADOMA ART FES 4', 5, '2025-01-01T00:00:00Z'),          // 同じ大会番号の重複 (古い) → 除外
    A(2026.5, '小数year', 2, '2026-08-01T00:00:00Z'),                 // 非整数 → 除外
];
const mappedA = mapArchives(rawArchives);
assert.deepEqual(mappedA.map(a => a.year), [2026, 2024], 'year 降順・無効エントリ除外');
assert.equal(mappedA[1].gallery.length, 3, '重複は公開が新しい方を採用');
assert.equal(mappedA[0].gallery.length, 2);
assert.ok(mappedA[0].heroImage.startsWith('https://'), 'マニフェスト無しでは CMS URL のまま');
// マニフェスト解決
const aManifest = { 'https://images.microcms-assets.io/assets/svc/hero2026/hero.jpg': '/cms-assets/archive/2026/hero.jpg' };
const mappedA2 = mapArchives(rawArchives, aManifest);
assert.equal(mappedA2[0].heroImage, '/cms-assets/archive/2026/hero.jpg');
console.log('OK 6: archives → 降順ソート / 写真ゼロ・重複・非整数の除外 / マニフェスト解決');

// --- 5. 表示用の短縮名 (メニューの「KAF5イベント風景Photoギャラリー」) と URL 用 slug ---
assert.equal(shortNameOf('KADOMA ART FES 5', 2026), 'KAF5');
assert.equal(shortNameOf('KADOMA ART FES 6', 2026), 'KAF6');
assert.equal(shortNameOf('KADOMA ART FES 10', 2031), 'KAF10');
assert.equal(shortNameOf('KADOMAARTFES7', 2027), 'KAF7', '詰めた表記でも導出できる');
assert.equal(shortNameOf('kadoma art fes 8', 2028), 'KAF8', '小文字でも導出できる');
assert.equal(shortNameOf('門真アートフェス', 2029), '2029', '想定外の表記は開催年で代替する');
assert.equal(shortNameOf(undefined, 2030), '2030', '大会名が無い場合も開催年で代替する');
assert.equal(mappedA[0].shortName, 'KAF5', 'mapArchives が shortName を持つ');
assert.equal(editionNumberOf('KADOMA ART FES 05'), 5, '先頭ゼロは無視');
assert.equal(editionNumberOf('門真アートフェス'), null);
assert.equal(slugOf('KADOMA ART FES 5', 2026), 'kaf5', 'slug は小文字');
assert.equal(slugOf('門真アートフェス', 2029), '2029', '想定外の表記は開催年が slug');
assert.equal(mappedA[0].slug, 'kaf5');
assert.equal(mappedA[0].edition, 5);
console.log('OK 7: 短縮名・slug の導出 → 大会名から KAF◯ / 想定外は開催年で代替');

// --- 6. 同じ開催年に 2 大会 (KAF5 = 2026年3月 / KAF6 = 2026年9月) ---
// 開催年キーでは片方が消えていた事故の再発防止。キーは大会番号で、年はソートと表示にのみ使う
const sameYear = mapArchives([
    A(2026, 'KADOMA ART FES 5', 2, '2026-08-02T00:00:00Z'),
    A(2026, 'KADOMA ART FES 6', 4, '2026-11-10T00:00:00Z'),
    A(2024, 'KADOMA ART FES 4', 3, '2026-08-01T00:00:00Z'),
]);
assert.deepEqual(sameYear.map(a => a.slug), ['kaf6', 'kaf5', 'kaf4'], '同年の 2 大会が両方残り、番号の大きい方が最新');
assert.deepEqual(sameYear.map(a => a.year), [2026, 2026, 2024]);
assert.equal(sameYear[0].shortName, 'KAF6', '最新枠は KAF6');
// 想定外の大会名は開催年で代替し、他の大会と共存する (消えない)
const mixed = mapArchives([
    A(2026, 'KADOMA ART FES 5', 2, '2026-08-02T00:00:00Z'),
    A(2029, '門真アートフェス', 1, '2029-12-01T00:00:00Z'),
]);
assert.deepEqual(mixed.map(a => a.slug), ['2029', 'kaf5'], '番号が取れない大会は年が slug になり、年順で並ぶ');
assert.equal(mixed[0].edition, null);
// 番号の後ろに語が続く大会名は同じ大会 (KAF7 はコンテスト展示が本体)
assert.equal(slugOf('KADOMA ART FES 7 CONTEST', 2027), 'kaf7');
// 想定外の表記はすべて開催年に落ちる (運用ガイドの NG 例と対応)
for (const bad of ['KAF6', '第6回 KADOMA ART FES', 'KADOMA ART FES ６', 'ＫＡＤＯＭＡ ART FES 6']) {
    assert.equal(slugOf(bad, 2026), '2026', `NG 例「${bad}」は開催年で代替`);
}
// 極端な桁数でも slug は英数字のまま (Number 経由の指数表記にならない)
assert.equal(slugOf('KADOMA ART FES 1000000000000000000000', 2030), 'kaf1000000000000000000000');
// 同じ番号・別の年 = 番号の打ち間違い: 公開が新しい方が残り、警告に両方の情報が出る
{
    const warned = [];
    const orig = console.warn; console.warn = (m) => warned.push(String(m));
    const dup = mapArchives([
        A(2026, 'KADOMA ART FES 5', 2, '2026-08-02T00:00:00Z'),
        A(2027, 'KADOMA ART FES 5', 1, '2027-06-01T00:00:00Z'),   // 番号を直し忘れた KAF7 のつもり
    ]);
    console.warn = orig;
    assert.deepEqual(dup.map(a => [a.slug, a.year]), [['kaf5', 2027]], '公開が新しい方を採用');
    assert.ok(warned.some(m => m.includes('year=2026') && m.includes('year=2027') && m.includes('開催年が違う')), '両方の year と注意喚起が警告に含まれる');
}
// 番号が大きいのに年が古い = 開催年の入力ミスの可能性: 年順が優先されるが警告する
{
    const warned = [];
    const orig = console.warn; console.warn = (m) => warned.push(String(m));
    const odd = mapArchives([
        A(2026, 'KADOMA ART FES 5', 2, '2026-08-02T00:00:00Z'),
        A(2025, 'KADOMA ART FES 8', 1, '2026-09-01T00:00:00Z'),
    ]);
    console.warn = orig;
    assert.deepEqual(odd.map(a => a.slug), ['kaf5', 'kaf8'], '最新判定は開催年が優先 (意図した挙動)');
    assert.ok(warned.some(m => m.includes('順序が食い違って')), '食い違いを警告する');
}
console.log('OK 8: 同一開催年の 2 大会が共存 / 番号なし大会名は開催年キーで代替 / 重複・順序矛盾の警告');

// --- 7. 大会別アーカイブ索引 (イベント風景 + コンテスト受賞作品の突き合わせ) ---
const contests = [
    { slug: 'kaf5', year: 2026, title: 'KADOMA ART FES 5', contestTitle: 'KAF5 受賞作品', page: '/contest/kaf5.html' },
    { slug: 'kaf4', year: 2024, title: 'KADOMA ART FES 4', contestTitle: '2024 受賞作品', page: '/contest/kaf4.html' },
    { slug: '', year: 2020, title: '壊れた行', page: '' },   // slug/page が無い行は無視
];
const idxArchives = mapArchives([
    A(2026, 'KADOMA ART FES 6', 3, '2026-11-10T00:00:00Z'),
    A(2026, 'KADOMA ART FES 5', 2, '2026-08-02T00:00:00Z'),
]);
const merged = mergeEditions(idxArchives, contests);
assert.deepEqual(merged.map(e => e.slug), ['kaf6', 'kaf5', 'kaf4'], '年降順→番号降順。片方にしかない大会も載る');
assert.equal(merged[0].contest, null, 'KAF6 はコンテストなし');
assert.ok(merged[0].event, 'KAF6 はイベント風景あり');
assert.ok(merged[1].event && merged[1].contest, 'KAF5 は両方');
assert.equal(merged[2].event, null, '2024 はイベント風景なし (写真未登録)');
assert.equal(merged[2].contest.page, '/contest/kaf4.html');
assert.equal(merged[2].shortName, 'KAF4', '台帳だけの大会も短縮名を導出');
assert.equal(merged[1].title, 'KADOMA ART FES 5', 'CMS の大会名を優先');
// 最新 (CMS の写真あり最新) は一覧から除く。台帳のみの大会は最新にならない
const latest = idxArchives[0];
const past = merged.filter(e => e.slug !== latest.slug);
assert.deepEqual(past.map(e => e.slug), ['kaf5', 'kaf4']);
// 台帳のみ (CMS 0 件) でも一覧が成立する (休眠にならない)
const onlyContests = mergeEditions([], contests);
assert.deepEqual(onlyContests.map(e => e.slug), ['kaf5', 'kaf4']);
// 最新大会 (写真あり) に受賞作品があっても、一覧からは大会ごと除かれる (意図した挙動を固定。
// その大会の受賞作品はイベント風景ページ内の相互リンクからのみ辿れる)
{
    const m = mergeEditions(mapArchives([A(2026, 'KADOMA ART FES 5', 2, '2026-08-02T00:00:00Z')]), contests);
    const lt = m[0];
    assert.equal(lt.slug, 'kaf5'); assert.ok(lt.contest, '最新 KAF5 には受賞作品がある');
    assert.deepEqual(m.filter(e => e.slug !== lt.slug).map(e => e.slug), ['kaf4'], '一覧は KAF4 のみ');
}
// 台帳の不正な行: slug の大文字は小文字に正規化して CMS と結合、year 非数値・slug 重複は警告して除外
{
    const warned = [];
    const orig = console.warn; console.warn = (m) => warned.push(String(m));
    const m = mergeEditions(idxArchives, [
        { slug: 'KAF5', year: 2026, title: 'KADOMA ART FES 5', page: '/contest/kaf5.html' },
        { slug: 'kaf5', year: 2026, title: '重複', page: '/contest/dup.html' },
        { slug: 'kaf3', year: 'abc', title: 'KADOMA ART FES 3', page: '/contest/kaf3.html' },
    ]);
    console.warn = orig;
    assert.deepEqual(m.map(e => e.slug), ['kaf6', 'kaf5'], '大文字 slug は kaf5 に結合され、不正行は除外');
    assert.equal(m[1].contest.page, '/contest/kaf5.html', '重複は先の行を採用');
    assert.ok(warned.some(w => w.includes('重複')) && warned.some(w => w.includes('year が正の整数')), '警告が出る');
}
// site.json の台帳: page に対応するページと thumb の実ファイルが存在する (追加時の置き忘れ防止)
for (const c of local.contests) {
    assert.ok(fs.existsSync(`src/pages/contest/${c.slug}.astro`), `contests: ${c.slug} のページ src/pages/contest/${c.slug}.astro が無い`);
    assert.equal(c.page, `/contest/${c.slug}.html`, `contests: ${c.slug} の page は /contest/${c.slug}.html のはず`);
    if (c.thumb) assert.ok(fs.existsSync(`public${c.thumb}`), `contests: ${c.slug} の thumb ${c.thumb} が無い`);
}
console.log('OK 9: 大会別アーカイブ索引 → CMS と contests 台帳の突き合わせ / 片方のみの大会 / 最新除外 / 台帳の検査');

console.log('\n全テスト合格 (archives 含む)');
