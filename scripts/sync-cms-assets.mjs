// microCMS のメディア (画像 / PDF) をビルド前にローカルへミラーする
//
// 目的: microCMS の無料枠は転送量 20GB/月。メディアを CMS から直接配信すると
// アクセスのたびに消費するため、ビルド時に 1 回だけ取得して Cloudflare 側
// (public/cms-assets/) から配信する。
//
// 実行タイミング: npm run build の先頭 (package.json の build スクリプト)
// 環境変数が無ければ何もしない (ローカルデータでのビルドに影響しない)。
//
// 出力:
//   public/cms-assets/<ファイル名>       … ミラーされた実ファイル
//   src/data/cms-assets.json             … CMSフィールドID → ローカルパス の対応表
import fs from 'node:fs';
import path from 'node:path';

const DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN;
const API_KEY = process.env.MICROCMS_API_KEY;

const OUT_DIR = 'public/cms-assets';
const MANIFEST = 'src/data/cms-assets.json';

// site-settings のメディア系フィールド (docs/microcms-schema.md と同期)
const MEDIA_FIELDS = [
    'images_flyerFront', 'images_flyerFull', 'images_mainVisual',
    'images_supportList', 'images_entryThumb', 'images_contestBanner',
    'images_flyerBack', 'images_webBanner',
    'contest_entryPdf',
];

if (!DOMAIN || !API_KEY) {
    console.log('[sync-cms-assets] 環境変数が未設定のためスキップ (ローカルデータでビルドします)');
    process.exit(0);
}

const res = await fetch(`https://${DOMAIN}.microcms.io/api/v1/site-settings`, {
    headers: { 'X-MICROCMS-API-KEY': API_KEY },
});
if (!res.ok) {
    console.warn(`[sync-cms-assets] site-settings の取得に失敗 (HTTP ${res.status})。ミラーをスキップします`);
    process.exit(0); // ビルド自体は止めない
}
const settings = await res.json();

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifest = {};

for (const fieldId of MEDIA_FIELDS) {
    const v = settings[fieldId];
    const url = v && typeof v === 'object' ? v.url : null;
    if (!url) continue; // 未入力フィールドはスキップ (content.js がローカル値に fallback)

    const name = path.basename(new URL(url).pathname);
    const dest = path.join(OUT_DIR, name);
    try {
        const r = await fetch(url, { headers: { 'X-MICROCMS-API-KEY': API_KEY } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
        manifest[fieldId] = `/cms-assets/${name}`;
        console.log(`[sync-cms-assets] ${fieldId} → ${manifest[fieldId]}`);
    } catch (e) {
        console.warn(`[sync-cms-assets] ${fieldId} の取得に失敗 (${e.message})。CMS URL のまま使用します`);
    }
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`[sync-cms-assets] 完了: ${Object.keys(manifest).length} 件をミラーしました`);
