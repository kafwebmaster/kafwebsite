// microCMS のメディア (画像 / PDF) をビルド前にローカルへミラーする
//
// 目的: microCMS の無料枠は転送量 20GB/月。メディアを CMS から直接配信すると
// アクセスのたびに消費するため、ビルド時に取得して Cloudflare 側
// (public/cms-assets/) から配信する。
//
// 対象:
//   - site-settings のメディア 9 フィールド (画像 8 + PDF 1)
//   - editions-archive 全件の heroImage / gallery (保存先は archive/{year}/ 配下、
//     ファイル名にアセット ID を含めて同名衝突を防ぐ)
//
// 転送量対策: 画像は imgix パラメータ (?w=1600&q=75) を付けて取得し、
// 原寸ダウンロードを避ける。PDF はパラメータなし。
//
// 実行タイミング: npm run build の先頭 (package.json の build スクリプト)
// 環境変数が無ければ何もしない (ローカルデータでのビルドに影響しない)。
//
// 出力:
//   public/cms-assets/...                … ミラーされた実ファイル
//   src/data/cms-assets.json             … 「CMS の URL → ローカルパス」の対応表
import fs from 'node:fs';
import path from 'node:path';

const DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN;
const API_KEY = process.env.MICROCMS_API_KEY;

const OUT_DIR = 'public/cms-assets';
const MANIFEST = 'src/data/cms-assets.json';
const IMAGE_PARAMS = '?w=1600&q=75';

// site-settings のメディア系フィールド (docs/microcms-schema.md と同期)
const SITE_MEDIA_FIELDS = [
    'images_flyerFront', 'images_flyerFull', 'images_mainVisual',
    'images_supportList', 'images_entryThumb', 'images_contestBanner',
    'images_flyerBack', 'images_webBanner',
    'contest_entryPdf',
];

if (!DOMAIN || !API_KEY) {
    console.log('[sync-cms-assets] 環境変数が未設定のためスキップ (ローカルデータでビルドします)');
    process.exit(0);
}

const getJson = async (endpoint, query = '') => {
    const res = await fetch(`https://${DOMAIN}.microcms.io/api/v1/${endpoint}${query}`, {
        headers: { 'X-MICROCMS-API-KEY': API_KEY },
    });
    if (!res.ok) throw new Error(`GET ${endpoint}: HTTP ${res.status}`);
    return res.json();
};

const manifest = {};
let failed = 0;

// microCMS のアセット URL は .../assets/{assetId}/{fileName} 形式。
// アセット ID を名前に含めて衝突を防ぐ。
//
// ファイル名は必ず ASCII だけに落とすこと。
// URL.pathname は日本語などをパーセントエンコードしたまま返すため、そのまま
// ファイル名に使うと「%E3%82%BB」という文字列がファイル名になり、
// ブラウザは同じ文字列をエンコード済みと解釈して「セ」にデコードして要求するため、
// 実ファイルと要求パスが食い違って 404 になる (原寸の日本語名画像が壊れる)。
// デコードしてから ASCII 以外を _ に潰すことで、この食い違いを構造的に無くす。
const localNameFor = (url) => {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const assetId = parts.at(-2) ?? 'x';
    let file = parts.at(-1);
    try {
        file = decodeURIComponent(file);
    } catch {
        // 不正なエスケープが含まれる場合はそのまま次の置換に任せる
    }
    const safe = file.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
    return `${assetId.slice(0, 8)}-${safe}`;
};

async function mirror(url, subdir, { isImage }) {
    if (!url || manifest[url]) return;
    const dir = path.join(OUT_DIR, subdir);
    fs.mkdirSync(dir, { recursive: true });
    const name = localNameFor(url);
    if (encodeURIComponent(name) !== name) {
        // ここに来る = URL に出すとエンコードされる文字が残っている (上の対策の破れ)
        console.warn(`[sync-cms-assets] ファイル名に URL 安全でない文字が残っています: ${name}`);
    }
    const dest = path.join(dir, name);
    const fetchUrl = isImage ? `${url}${IMAGE_PARAMS}` : url;
    try {
        const r = await fetch(fetchUrl, { headers: { 'X-MICROCMS-API-KEY': API_KEY } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
        manifest[url] = `/${path.posix.join('cms-assets', subdir, name)}`.replace(/\\/g, '/');
    } catch (e) {
        failed++;
        console.warn(`[sync-cms-assets] 取得失敗 (${e.message}): ${url} → CMS URL のまま使用します`);
    }
}

const mediaUrl = (v) => (v && typeof v === 'object' ? v.url : null);

// --- site-settings ---
try {
    const settings = await getJson('site-settings');
    for (const fieldId of SITE_MEDIA_FIELDS) {
        const url = mediaUrl(settings[fieldId]);
        if (!url) continue;
        await mirror(url, '', { isImage: fieldId !== 'contest_entryPdf' });
    }
} catch (e) {
    console.warn(`[sync-cms-assets] site-settings の取得に失敗 (${e.message.replace(/^GET [^:]+: /, '')})。ミラーをスキップします`);
}

// --- editions-archive (heroImage / gallery) ---
try {
    const res = await getJson('editions-archive', '?limit=100');
    for (const item of res.contents ?? []) {
        const subdir = `archive/${item.year}`;
        await mirror(mediaUrl(item.heroImage), subdir, { isImage: true });
        for (const g of Array.isArray(item.gallery) ? item.gallery : []) {
            await mirror(mediaUrl(g), subdir, { isImage: true });
        }
    }
} catch (e) {
    console.warn(`[sync-cms-assets] editions-archive の取得に失敗 (${e.message.replace(/^GET [^:]+: /, '')})。アーカイブ画像のミラーをスキップします`);
}

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`[sync-cms-assets] 完了: ${Object.keys(manifest).length} 件をミラーしました${failed ? ` (失敗 ${failed} 件は CMS URL 直参照)` : ''}`);
