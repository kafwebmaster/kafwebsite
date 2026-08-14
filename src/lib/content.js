// データ取得層
//
// microCMS の接続情報 (環境変数) が設定されていれば microCMS から取得し、
// 未設定・取得失敗時はローカルの src/data/site.json にフォールバックする。
// どちらの場合も同じ構造 (site.json と同形) のオブジェクトを返すため、
// ページ側は取得元を意識しない。
//
// 環境変数 (Cloudflare Pages の Variables and secrets に設定):
//   MICROCMS_SERVICE_DOMAIN … サービスID (kadoma-artfes)
//   MICROCMS_API_KEY        … 読み取り (GET) 権限の API キー
//
// メディア (画像 / PDF) について:
//   microCMS のメディア URL を直接使うと無料枠の転送量 (20GB/月) を消費するため、
//   ビルド前に scripts/sync-cms-assets.mjs がファイルを取得し、
//   public/cms-assets/ に配置 + src/data/cms-assets.json に対応表を書き出す。
//   本モジュールは対応表があればローカルパスを、無ければ CMS URL を使う。
import fs from 'node:fs';
import path from 'node:path';

// site.json は静的 import ではなく fs で読む。
// パスはプロジェクトルート基準 (process.cwd())。
// import.meta.url 基準にするとバンドル後の実行位置 (dist/.prerender/) を
// 指してしまうため使わない。
const fromRoot = (p) => path.resolve(process.cwd(), p);
const localData = JSON.parse(fs.readFileSync(fromRoot('src/data/site.json'), 'utf8'));

// microCMS のフィールド ID は 20 文字以内の制限があるため、
// site.json のキー名と一部異なる (docs/microcms-schema.md 7 章の対応表と同期)
const FIELD_MAP = {
    edition: {
        displayName: 'edition_name',
        displayNameShort: 'edition_nameShort',
        displayNameCompact: 'edition_nameCompact',
        fiscalYearLabel: 'edition_fiscalYear',
        eventYear: 'edition_eventYear',
        yearsRunning: 'edition_yearsRunning',
        slug: 'edition_slug',
        number: 'edition_number',
    },
    event: {
        dateRange: 'event_dateRange',
        dateRangeLong: 'event_dateRangeLong',
        time: 'event_time',
        timeShort: 'event_timeShort',
        venue: 'event_venue',
        admission: 'event_admission',
    },
    contest: {
        status: 'contest_status',
        statusLabel: 'contest_statusLabel',
        entryDeadline: 'contest_deadlineFull',
        entryDeadlineShort: 'contest_deadline',
        exhibitionPeriod: 'contest_exhibPeriod',
        exhibitionPeriodFull: 'contest_exhibFull',
        deliveryPeriod: 'contest_delivery',
        entryPdf: 'contest_entryPdf',
        entryFormUrl: 'contest_entryFormUrl',
        // 2大会並走対応: サイト全体 (edition_*) と募集 (contest_*) を分離
        editionName: 'contest_editionName',
        venue: 'contest_venue',
        entryFee: 'contest_entryFee',
        mailingAddr: 'contest_mailingAddr',
        bankInfo: 'contest_bankInfo',
    },
    marche: {
        displayName: 'marche_name',
        dateRange: 'marche_dateRange',
        time: 'marche_time',
        venue: 'marche_venue',
    },
    images: {
        flyerFront: 'images_flyerFront',
        flyerBack: 'images_flyerBack',
        flyerFull: 'images_flyerFull',
        mainVisual: 'images_mainVisual',
        supportList: 'images_supportList',
        webBanner: 'images_webBanner',
        entryThumbnail: 'images_entryThumb',
        contestBanner: 'images_contestBanner',
    },
    gallery: {
        latestYear: 'gallery_latestYear',
        latestPage: 'gallery_latestPage',
        latestLabel: 'gallery_latestLabel',
    },
    contact: {
        email: 'contact_email',
        entryEmail: 'contact_entryEmail',
    },
    organization: {
        host: 'organization_host',
        coHost: 'organization_coHost',
        support: 'organization_support',
    },
    social: {
        youtube: 'social_youtube',
        instagram: 'social_instagram',
    },
    // 固定文言の CMS 化 (トップ紹介文など)
    siteText: {
        intro: 'site_introText',
        mainEvent: 'site_mainEvent',
    },
};

// メディア系フィールド (値が { url } オブジェクトで返るもの)
const MEDIA_SECTIONS = new Set(['images']);
const FILE_FIELDS = new Set(['contest_entryPdf']);

const env = () => ({
    domain: import.meta.env?.MICROCMS_SERVICE_DOMAIN ?? process.env.MICROCMS_SERVICE_DOMAIN,
    apiKey: import.meta.env?.MICROCMS_API_KEY ?? process.env.MICROCMS_API_KEY,
});

async function fetchCms(domain, apiKey, endpoint, query = '') {
    const url = `https://${domain}.microcms.io/api/v1/${endpoint}${query}`;
    const res = await fetch(url, { headers: { 'X-MICROCMS-API-KEY': apiKey } });
    if (!res.ok) {
        throw new Error(`microCMS ${endpoint}: HTTP ${res.status}`);
    }
    return res.json();
}

// ビルド前ミラー (scripts/sync-cms-assets.mjs) の対応表を読む
function loadAssetManifest() {
    try {
        return JSON.parse(fs.readFileSync(fromRoot('src/data/cms-assets.json'), 'utf8'));
    } catch {
        return {}; // 未生成なら空 (CMS URL をそのまま使う)
    }
}

// select フィールドは配列で返る (multipleSelect=false でも)
const unwrapSelect = (v) => (Array.isArray(v) ? v[0] : v);

// メディア / ファイルの値をローカルパス or CMS URL に解決
// マニフェストは「CMS の URL → ローカルパス」の対応表 (配列メディアにも対応できる形)
function resolveMedia(value, manifest, fallback) {
    const url = value && typeof value === 'object' ? value.url : value;
    if (!url) return fallback; // CMS 側が未入力ならローカルの現行値を使う
    return manifest[url] ?? url;
}

// site-settings (フラット) → site.json と同じ入れ子構造へ復元
export function mapSiteSettings(cms, fallback, manifest = {}) {
    const out = {};
    for (const [section, fields] of Object.entries(FIELD_MAP)) {
        out[section] = {};
        for (const [key, cmsId] of Object.entries(fields)) {
            const fb = fallback[section]?.[key];
            let v = cms[cmsId];
            if (MEDIA_SECTIONS.has(section) || FILE_FIELDS.has(cmsId)) {
                v = resolveMedia(v, manifest, fb);
            } else if (cmsId === 'contest_status') {
                v = unwrapSelect(v);
            }
            out[section][key] = v ?? fb; // CMS 未入力はローカル値で補完
        }
    }
    return out;
}

// news 一覧 → site.json の news 配列と同形へ
export function mapNews(contents) {
    return contents.map((item) => ({
        date: item.date,
        category: unwrapSelect(item.category),
        text: item.text,
        link: item.link || null,
    }));
}

// sponsors 一覧 → 表示順に整列
// (order 指定があればその昇順、無いものは登録順 = publishedAt 昇順で後ろに)
export function mapSponsors(contents) {
    return contents
        .map((item, i) => ({ name: item.name, order: item.order ?? null, _i: i }))
        .sort((a, b) => {
            if (a.order != null && b.order != null) return a.order - b.order;
            if (a.order != null) return -1;
            if (b.order != null) return 1;
            return a._i - b._i;
        })
        .map(({ name }) => ({ name }));
}

let cache = null;

export async function getSiteData() {
    if (cache) return cache;
    const { domain, apiKey } = env();

    if (!domain || !apiKey) {
        cache = localData;
        return cache;
    }

    try {
        const manifest = loadAssetManifest();
        const [settings, news, sponsors] = await Promise.all([
            fetchCms(domain, apiKey, 'site-settings'),
            fetchCms(domain, apiKey, 'news', '?limit=100&orders=-publishedAt'),
            fetchCms(domain, apiKey, 'sponsors', '?limit=100&orders=publishedAt'),
        ]);
        cache = {
            ...mapSiteSettings(settings, localData, manifest),
            news: news.contents?.length ? mapNews(news.contents) : localData.news,
            sponsors: sponsors.contents?.length ? mapSponsors(sponsors.contents) : localData.sponsors,
        };
        console.log(`[content] microCMS から取得しました (news ${news.contents?.length ?? 0} 件 / sponsors ${sponsors.contents?.length ?? 0} 件)`);
    } catch (e) {
        // 取得失敗でビルドを止めない (ローカルデータで成立させる)。ログで検知する
        console.warn(`[content] microCMS 取得に失敗したためローカルデータで続行します: ${e.message}`);
        cache = localData;
    }
    return cache;
}

// ===== 過去大会アーカイブ =====

// 生データ → 有効エントリの正規化 (docs/archive-feature-design.md 3-2)
// - year が正の整数でないものは警告して除外
// - gallery (写真) が空のものは「準備中」とみなし除外
//   (翌年大会の先行登録で空ギャラリーが最新枠を奪う事故の防止)
// - year 重複は警告し、公開が新しい方 (publishedAt 降順で先勝ち) を採用
// - year 降順に整列して返す
export function mapArchives(contents, manifest = {}) {
    const seen = new Map();
    // publishedAt 降順で処理し、重複 year は最初 (=公開が新しい方) を採用
    const byNewest = [...contents].sort((a, b) =>
        String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')));
    for (const item of byNewest) {
        const year = item.year;
        if (!Number.isInteger(year) || year <= 0) {
            console.warn(`[content] editions-archive: year が正の整数ではないため除外します (year=${year}, title=${item.title})`);
            continue;
        }
        const gallery = Array.isArray(item.gallery) ? item.gallery : [];
        if (gallery.length === 0) {
            console.warn(`[content] editions-archive: 写真が未登録のため準備中として除外します (year=${year}, title=${item.title})`);
            continue;
        }
        if (seen.has(year)) {
            console.warn(`[content] editions-archive: year=${year} が重複しています。公開が新しい方を採用します`);
            continue;
        }
        seen.set(year, {
            year,
            title: item.title ?? '',
            dateRange: item.dateRange ?? '',
            description: item.description ?? '',
            heroImage: resolveMedia(item.heroImage, manifest, null),
            gallery: gallery.map((g) => resolveMedia(g, manifest, null)).filter(Boolean),
        });
    }
    return [...seen.values()].sort((a, b) => b.year - a.year);
}

const loadLocalArchives = () => {
    try {
        return JSON.parse(fs.readFileSync(fromRoot('src/data/archives.json'), 'utf8'));
    } catch {
        return [];
    }
};

let archivesCache = null;

// アーカイブ全件 (year 降順・正規化済み)。
// 優先順: ARCHIVES_FIXTURE (テスト用) > microCMS > archives.json スナップショット
export async function getArchives() {
    if (archivesCache) return archivesCache;

    const fixture = process.env.ARCHIVES_FIXTURE;
    if (fixture) {
        console.log(`[content] ARCHIVES_FIXTURE からアーカイブを読み込みます: ${fixture}`);
        archivesCache = mapArchives(JSON.parse(fs.readFileSync(fixture, 'utf8')), loadAssetManifest());
        return archivesCache;
    }

    const { domain, apiKey } = env();
    if (!domain || !apiKey) {
        archivesCache = mapArchives(loadLocalArchives());
        return archivesCache;
    }
    try {
        const res = await fetchCms(domain, apiKey, 'editions-archive', '?limit=100');
        archivesCache = mapArchives(res.contents ?? [], loadAssetManifest());
        console.log(`[content] editions-archive を取得しました (有効 ${archivesCache.length} 件)`);
    } catch (e) {
        // 取得失敗を「アーカイブ 0 件」と混同しない: スナップショットへフォールバック
        console.warn(`[content] editions-archive の取得に失敗したためスナップショット (archives.json) で続行します: ${e.message}`);
        archivesCache = mapArchives(loadLocalArchives());
    }
    return archivesCache;
}

// 最新大会 (メニューの訴求枠) と過去大会 (アーカイブ一覧) への分割
export async function getArchiveSplit() {
    const archives = await getArchives();
    return {
        archives,
        latest: archives[0] ?? null,
        past: archives.slice(1),
    };
}
