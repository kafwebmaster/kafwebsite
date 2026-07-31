// データ取得層
// microCMS の接続情報 (環境変数) が設定されていれば microCMS から取得し、
// 未設定ならローカルの src/data/site.json を返す。
// どちらの場合も同じ構造のオブジェクトを返すため、ページ側は取得元を意識しない。
//
// 環境変数 (Cloudflare Pages の Variables and secrets に設定):
//   MICROCMS_SERVICE_DOMAIN … 例: kadoma-artfes
//   MICROCMS_API_KEY        … microCMS の API キー
import site from '../data/site.json';

export async function getSiteData() {
    const domain = import.meta.env.MICROCMS_SERVICE_DOMAIN;
    const apiKey = import.meta.env.MICROCMS_API_KEY;

    if (!domain || !apiKey) {
        return site;
    }

    // 第 2 週で実装: microCMS の site-settings / news / editions-archive /
    // sponsors API から取得し、site.json と同一構造へマッピングする。
    // 取得に失敗した場合はローカルデータへフォールバックする。
    return site;
}
