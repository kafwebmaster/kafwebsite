// 共通パーツを非同期で読み込み、すべての読み込み完了後に
// 'includes:loaded' カスタムイベントを document に対して発火する。
// data-loader.js など、共通パーツ内の要素に対する処理は
// このイベントを待ってから実行すること。
$(function () {
    // 読み込み対象の定義 (セレクタとパーツファイルの対応表)
    var parts = [
        { selector: "#include-header",  url: "includeHTML/header.html"  },
        { selector: "#include-menubar", url: "includeHTML/menubar.html" },
        { selector: "#include-hbpinfo", url: "includeHTML/hbpinfo.html" },
        { selector: "#include-footer",  url: "includeHTML/footer.html"  }
    ];

    // 対象要素がページに存在するものだけを実際にロードする。
    // (既存の .load() はセレクタが空集合だと AJAX を発火しないため、
    //  その挙動を踏襲して不要な HTTP リクエストを避ける)
    var deferreds = parts
        .filter(function (part) {
            return $(part.selector).length > 0;
        })
        .map(function (part) {
            return $.get(part.url)
                .done(function (html) {
                    $(part.selector).html(html);
                })
                .fail(function (jqXHR, textStatus, errorThrown) {
                    console.error(
                        "[include.js] 共通パーツの読み込みに失敗しました: " + part.url,
                        textStatus, errorThrown
                    );
                });
        });

    // すべての取得が完了 (成功・失敗問わず) したら
    // 'includes:loaded' イベントを document に対して発火。
    // .always() を使うことで、1 つが失敗しても残りの処理は進む。
    $.when.apply($, deferreds).always(function () {
        $(document).trigger("includes:loaded");
    });
});
