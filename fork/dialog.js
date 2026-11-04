/* Fork addition: one dialog for all fork questions (exit, Plex, TMDB key, navigation entry).
   window.WholphinDialog({ title, text, input, buttons: [{ label, action, keep }], vertical, focus, onClose })
   shows a modal box that keeps the remote's keys: arrows move between the field and the
   buttons (left/right stay in the text field), Back closes, OK on the field presses the first
   button. A button closes the dialog after its action unless it has keep: true.
   Returns { box, buttons, input, message, close }.
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  function el(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  window.WholphinDialog = function (options) {
    var opener = document.activeElement,
      dialog = el("section", "fork-dialog", null, document.body);
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("data-no-i18n", "");
    var box = el("div", "fork-exit-box" + (options.boxClass ? " " + options.boxClass : ""), null, dialog);
    el("h2", null, options.title, box);
    if (options.text) el("p", "metadata", options.text, box);
    var input = null;
    if (options.input) {
      input = el("input", "fork-tmdb-input", null, box);
      input.type = "text";
      input.value = options.input.value || "";
      input.setAttribute("autocomplete", "off");
      input.setAttribute("spellcheck", "false");
    }
    var message = el("p", "metadata fork-dialog-message", null, box),
      row = el("div", options.vertical ? "fork-nav-buttons" : "fork-exit-buttons", null, box),
      closed = false;
    function close() {
      if (closed) return;
      closed = true;
      dialog.remove();
      if (opener && opener.isConnected) opener.focus();
      if (options.onClose) options.onClose();
    }
    var buttons = (options.buttons || []).map(function (spec) {
      var b = el("button", null, spec.label, row);
      b.onclick = function () {
        var result = spec.action ? spec.action(api) : null;
        if (!spec.keep && !(result && result.then)) close();
      };
      return b;
    });
    var api = { dialog: dialog, box: box, buttons: buttons, input: input, message: message, close: close };
    dialog.addEventListener("keydown", function (event) {
      var key = event.keyCode,
        active = document.activeElement;
      event.stopPropagation();
      if (key === 461 || key === 27) {
        event.preventDefault();
        close();
        return;
      }
      if (active === input && key === 13) {
        event.preventDefault();
        if (buttons[0]) buttons[0].click();
        return;
      }
      if (key < 37 || key > 40 || (active === input && (key === 37 || key === 39))) return;
      event.preventDefault();
      var stops = (input ? [input] : []).concat(
        buttons.filter(function (b) {
          return !b.disabled;
        }),
      );
      var at = stops.indexOf(active),
        step = key === 37 || key === 38 ? -1 : 1;
      if (stops.length) stops[(at + step + stops.length) % stops.length].focus();
    });
    var first = input || buttons[options.focus || 0];
    if (first) first.focus();
    return api;
  };
})();
