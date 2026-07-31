// KADOMA ART FES 公式サイト Astro 設定
// - build.format: 'file' … src/pages/kaf_mmg.astro → /kaf_mmg.html
//   現行サイトの URL (.html 付き) を完全維持するための必須設定
// - compressHTML: false … 現行 HTML との diff 比較検証を容易にする
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kadoma-artfes.jp',
  output: 'static',
  build: {
    format: 'file'
  },
  compressHTML: false
});
