// 旧ギャラリー URL のリダイレクト生成 (ビルド後に実行)
//
// 転送先 (dist/archive/{slug}.html) が実際に存在するビルドのときだけ、
// dist/_redirects に旧 URL → 新 URL の 302 を出力する。
//
// 設計判断 (docs/archive-feature-design.md 7 章):
// - 拡張子なし URL (/2024gallery) を必ず含める (Cloudflare Pages は
//   .html 付きを拡張子なしへ 308 するため、実トラフィックの正規 URL はこちら)
// - 転送先も拡張子なし (リダイレクトチェーンの回避)
// - 302 を使う (301 の恒久キャッシュは転送先消滅時に 404 が焼き付くため。
//   運用が安定してから 301 への引き上げを検討)
// - CMS への再フェッチはせず「dist にファイルが実在するか」で判定
//   (ビルド本体との取得結果のズレを構造的に排除)
// - 既存の _redirects there には追記 (上書きしない)
import fs from 'node:fs';

// 旧 URL → アーカイブ詳細ページの slug (大会番号) の対応
// - /2024gallery: 移行前からある KAF4 の固定ページ (KAF4 をアーカイブ登録したら転送)
// - /archive/2026: アーカイブのキーが開催年だった時期の KAF5 の URL
//   (KAF5/KAF6 が同じ 2026 年のため、キーを大会番号に変更した。旧 URL は本番メニューに
//    載っていたので転送で救う)
//   ただし /archive/{year}.html は「大会名から番号を導出できない大会」の URL としても
//   生成されうる (content.js の代替規則)。_redirects は実ファイルより優先されるため、
//   転送元のページが実在するビルドではその大会が到達不能になる。転送元が実在する場合は
//   ルールを出力しない (unlessSourceExists)
// - /contest, /contest2024: 受賞作品ページを /contest/{slug}.html に移設した (アーカイブを
//   「大会 → コンテスト / イベント風景」の構成にしたため)。旧 URL の中身と 1 対 1 で対応する
//   新 URL へ送る (旧 /contest = KAF5 受賞作品 → /contest/kaf5、旧 /contest2024 → /contest/kaf4)
const LEGACY = [
    { from: '/2024gallery', to: '/archive/kaf4' },
    { from: '/archive/2026', to: '/archive/kaf5', unlessSourceExists: true },
    { from: '/contest2024', to: '/contest/kaf4' },
    { from: '/contest', to: '/contest/kaf5' },
];

const lines = [];
for (const { from, to, unlessSourceExists } of LEGACY) {
    if (!fs.existsSync(`dist${to}.html`)) continue;   // 転送先が実在するビルドのときだけ
    if (unlessSourceExists && fs.existsSync(`dist${from}.html`)) {
        console.warn(`[postbuild-redirects] ${from}.html が実在するため ${from} → ${to} の転送は出力しません`);
        continue;
    }
    lines.push(`${from} ${to} 302`);
    lines.push(`${from}.html ${to} 302`);
}

if (lines.length === 0) {
    console.log('[postbuild-redirects] 対象のアーカイブページが無いためリダイレクトは出力しません');
    process.exit(0);
}

const existing = fs.existsSync('dist/_redirects')
    ? fs.readFileSync('dist/_redirects', 'utf8').replace(/\s*$/, '\n')
    : '';
fs.writeFileSync('dist/_redirects', existing + lines.join('\n') + '\n');
console.log(`[postbuild-redirects] ${lines.length} 行を出力しました:\n  ${lines.join('\n  ')}`);
