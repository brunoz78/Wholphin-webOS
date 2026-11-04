/* Fork addition: "More" for shortened descriptions, as in Plex. Detail pages (movies, series,
   the season view with its episodes, collections, people) cut the description after a few
   lines. When it is cut, a "More" button joins the page's button row (or a row of its own)
   and shows the whole text; "Less" shortens it again.
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var de = !window.wholphinI18n || window.wholphinI18n.lang !== "en";
  function t(en, german) {
    return de ? german : en;
  }
  var main = document.getElementById("main");
  if (!main) return;

  function overview() {
    return main.classList.contains("detail-page") ? main.querySelector(".overview") : null;
  }
  function update() {
    var text = overview(),
      more = document.getElementById("fork-more");
    if (!text) {
      if (more) more.remove();
      return;
    }
    var open = text.classList.contains("fork-overview-open"),
      cut = open || text.scrollHeight > text.clientHeight + 2;
    if (!cut) {
      if (more && document.activeElement !== more) {
        var row = more.parentNode;
        more.remove();
        if (row.classList.contains("fork-more-actions") && !row.children.length) row.remove();
      }
      return;
    }
    if (!more) {
      more = document.createElement("button");
      more.id = "fork-more";
      more.className = "fork-more";
      more.setAttribute("data-no-i18n", "");
      more.onclick = function () {
        var shown = overview();
        if (!shown) return;
        shown.classList.toggle("fork-overview-open");
        update();
      };
      var actions = main.querySelector(".episode-browser-actions") || main.querySelector(".actions");
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "actions fork-more-actions";
        text.parentNode.insertBefore(actions, text.nextSibling);
      }
      actions.insertBefore(more, actions.querySelector(".fork-subtitle-action")); // subtitles stay last
      // A person page starts on "More" (the biography) instead of the first movie below it.
      var active = document.activeElement;
      if (main.classList.contains("fork-person-page") && active && active.closest(".season-grid") && active === active.parentNode.firstElementChild)
        more.focus();
    }
    more.textContent = open ? t("Less", "Weniger") : t("More", "Mehr");
  }
  // Pages and the episode shown in the season view change the text: check again shortly after.
  var timer = null;
  function later() {
    clearTimeout(timer);
    timer = setTimeout(update, 120);
  }
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++)
      if (records[i].target.id !== "fork-more" && (!records[i].target.closest || !records[i].target.closest("#fork-more"))) return later();
  }).observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", later);
})();
