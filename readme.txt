共通化処理について
    共通化したパーツhtmlはincludeHTMLフォルダに格納しています。
    <script src="js/include.js"></script>タグを使用したページ内で、以下の共通化パーツを使用できます。

    <div id="include-header"></div>
        indexページ以外のヘッダーを挿入します。
        内容の修正はincludeHTML/header.htmlを参照してください。
    <div id="include-menubar"></div>
        メニューバーを挿入します。
        内容の修正はincludeHTML/menubar.htmlを参照してください。
    <div id="include-hbpinfo"></div>
        H.B.Pギャラリーへの案内バナーを挿入します。
        内容の修正はincludeHTML/hbpinfo.htmlを参照してください。
    <div id="include-footer"></div>
        フッターを挿入します。
        内容の修正はincludeHTML/footer.htmlを参照してください。

ローカル実行について
    ローカルでwebページの確認をしたい場合、ローカルサーバを使用して確認してください。
    ブラウザでファイルパスを指定して確認すると、CORSのセキュリティエラーにより共通化パーツの読み込みが行われません。
    ローカルサーバでの確認を行いたくない場合はサーバへのアップロードを行うか、別途共通化処理の戻しを行う必要があります。
    （この症状、実装後に気付きました。）