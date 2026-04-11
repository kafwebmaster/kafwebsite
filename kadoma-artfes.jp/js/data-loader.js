// data-loader.js
// data.json を取得し、HTML 要素の data-field 系属性に値を差し込む。
//
// 対応属性:
//   data-field="edition.displayName"           → 要素の text を上書き
//   data-src-field="images.flyerFront"         → 要素の src 属性を上書き
//   data-href-field="contest.entryPdf"         → 要素の href 属性を上書き
//   data-alt-field="edition.displayNameShort"  → 要素の alt 属性を上書き
//   data-news-list                             → news 配列を <dt>/<dd> ペアで展開
//
// パスはドット区切り記法に対応。
//   例: "event.dateRange" → data.event.dateRange
//
// include.js が発火する 'includes:loaded' イベントを待ってから処理を開始する。
// これにより、共通パーツ (header.html / menubar.html など) 内の data-field 属性も
// 正しく処理できる。

$(function () {
    // include.js が共通パーツを全部読み込み終えるのを待つ
    $(document).on("includes:loaded", function () {
        $.getJSON("data.json")
            .done(function (data) {
                applyDataFields(data);
            })
            .fail(function (jqXHR, textStatus, errorThrown) {
                console.error(
                    "[data-loader.js] data.json の取得に失敗しました。",
                    textStatus, errorThrown
                );
            });
    });

    // ドット区切りパスで data オブジェクトから値を取り出す。
    // 見つからない場合は undefined を返す。
    //   getByPath({ a: { b: 1 } }, "a.b") → 1
    //   getByPath({ a: {} },        "a.b") → undefined
    function getByPath(obj, path) {
        var segments = String(path).split(".");
        var current = obj;
        for (var i = 0; i < segments.length; i++) {
            if (current == null || typeof current !== "object") {
                return undefined;
            }
            current = current[segments[i]];
        }
        return current;
    }

    // HTML 特殊文字をエスケープ (news-list 展開時に使用)
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // 単純属性差し込み (data-field, data-src-field, data-href-field, data-alt-field)
    // を共通化するヘルパー
    function applySimpleField(attrName, setter, data) {
        $("[" + attrName + "]").each(function () {
            var $el = $(this);
            var path = $el.attr(attrName);
            var value = getByPath(data, path);
            if (value === undefined) {
                console.warn(
                    "[data-loader.js] " + attrName + ": 値が見つかりません: " + path
                );
                return; // 値が無い場合は元の内容/属性を保持
            }
            setter($el, value);
        });
    }

    // data.json の値を各要素に差し込むメイン処理
    function applyDataFields(data) {
        // テキスト差し込み
        applySimpleField("data-field", function ($el, value) {
            $el.text(value);
        }, data);

        // src 属性
        applySimpleField("data-src-field", function ($el, value) {
            $el.attr("src", value);
        }, data);

        // href 属性
        applySimpleField("data-href-field", function ($el, value) {
            $el.attr("href", value);
        }, data);

        // alt 属性
        applySimpleField("data-alt-field", function ($el, value) {
            $el.attr("alt", value);
        }, data);

        // news 配列を <dt>/<dd> ペアで展開
        $("[data-news-list]").each(function () {
            var newsList = data.news;
            if (!Array.isArray(newsList)) {
                console.warn(
                    "[data-loader.js] data-news-list: data.news が配列ではありません"
                );
                return;
            }
            var html = newsList.map(function (item) {
                var date     = escapeHtml(item.date || "");
                var category = escapeHtml(item.category || "");
                var text     = escapeHtml(item.text || "");
                var dt = "<dt>" + date + "<span>" + category + "</span></dt>";
                var dd;
                if (item.link) {
                    dd = '<dd><a href="' + escapeHtml(item.link) + '">' + text + "</a></dd>";
                } else {
                    dd = "<dd>" + text + "</dd>";
                }
                return dt + dd;
            }).join("\n");
            $(this).html(html);
        });
    }
});
