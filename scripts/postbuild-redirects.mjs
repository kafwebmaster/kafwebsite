// 旧ギャラリー URL のリダイレクト生成 (ビルド後に実行)
//
// dist/archive/2024.html が実際に存在するビルドのときだけ、
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

// 旧 URL → アーカイブ年 の対応 (今後、年別の旧ページを増やす場合はここに追記)
const LEGACY = [
    { from: '/2024gallery', year: 2024 },
];

const lines = [];
for (const { from, year } of LEGACY) {
    if (fs.existsSync(`dist/archive/${year}.html`)) {
        lines.push(`${from} /archive/${year} 302`);
        lines.push(`${from}.html /archive/${year} 302`);
    }
}

// 受賞作品ページ (contest.html) の非公開化 (KAF6 対応)
// site.json の visibility.winnersPage が false の間はトップへ 302 し、
// 直接アクセスも不能にする (メニュー非表示は Menubar.astro 側の同じフラグで連動)。
// ページ自体は削除せずビルドに含めたままなので、フラグを true に戻せば即復活する。
// Cloudflare Pages の _redirects は静的ファイルより優先されるため、
// dist/contest.html が存在していてもリダイレクトが有効になる。
const visibility = JSON.parse(fs.readFileSync('src/data/site.json', 'utf8')).visibility ?? {};
if (visibility.winnersPage === false) {
    lines.push('/contest / 302');
    lines.push('/contest.html / 302');
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
