(function () {
  "use strict";

  /* ------------------------------------------------------------------
     SETTINGS
     ADMIN_HASH is a fingerprint of "weden-cup|username|password".
     To change the login: open admin.html, open the browser console and run
         wedenHash("newUsername", "newPassword")
     then paste the printed value below.
     Current login: username "admin", password "weden2026" (change it!)
  ------------------------------------------------------------------ */
  var CONFIG = {
    ADMIN_HASH: "9f3f8455c0be70477da9dca326d7c0f233deb857dd4a814af42b68d34fcf17f2",
    SALT: "weden-cup",
    DATA_URL: "players.js",
    DRAFT_KEY: "weden-cup-draft-v2",
    SESSION_KEY: "weden-cup-admin-session",
    REFRESH_MS: 30000
  };

  var isAdminPage = document.body.getAttribute("data-mode") === "admin";
  var state = { title: "1K ROBUX", players: [] };
  var loaded = false;
  var loadError = "";
  var loggedIn = false;
  var pendingAvatar = null;
  var avatarTargetId = null;
  var failedLogins = 0;

  var $ = function (id) { return document.getElementById(id); };
  var boardEl = $("board");
  var titleEl = $("title");

  /* ---------- helpers ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n, len) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < len) s = "0" + s;
    return s;
  }
  function isEditing() { return isAdminPage && loggedIn; }

  function validate(d) {
    if (!d || !Array.isArray(d.players)) throw new Error("Bad data");
    return {
      title: String(d.title || "1K ROBUX").slice(0, 24),
      players: d.players.map(function (p) {
        var pts = parseInt(p.points, 10);
        return {
          id: p.id ? String(p.id) : uid(),
          name: String(p.name || "Player").slice(0, 16),
          points: isNaN(pts) ? 0 : Math.max(0, pts),
          avatar: typeof p.avatar === "string" && p.avatar.indexOf("data:image/") === 0 ? p.avatar : null
        };
      })
    };
  }

  /* ---------- storage ---------- */
  function fetchLive() {
    return new Promise(function (resolve, reject) {
      try { delete window.WEDEN_DATA; } catch (e) { window.WEDEN_DATA = undefined; }
      var s = document.createElement("script");
      s.src = CONFIG.DATA_URL + "?t=" + Date.now();
      s.onload = function () {
        s.remove();
        try { resolve(validate(window.WEDEN_DATA)); } catch (e) { reject(e); }
      };
      s.onerror = function () { s.remove(); reject(new Error("Could not load " + CONFIG.DATA_URL)); };
      document.head.appendChild(s);
    });
  }
  function applyLive(d) { state = d; loaded = true; loadError = ""; render(); }
  function showLoadError(err) {
    if (window.console) console.error("Leaderboard data problem:", err);
    state = { title: state.title, players: [] };
    loaded = true;
    loadError = "Couldn’t load " + CONFIG.DATA_URL + ". Keep it in the same folder as the page and check it for typos.";
    render();
  }
  function loadDraft() {
    try {
      var raw = localStorage.getItem(CONFIG.DRAFT_KEY);
      return raw ? validate(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }
  function saveDraft() {
    if (!isAdminPage) return;
    try { localStorage.setItem(CONFIG.DRAFT_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- ranking ---------- */
  function sorted() {
    return state.players
      .map(function (p, i) { return { p: p, i: i }; })
      .sort(function (a, b) { return (b.p.points - a.p.points) || (a.i - b.i); })
      .map(function (x) { return x.p; });
  }

  function mix(a, b, t) { return Math.round(a + (b - a) * t); }
  function rowRgb(i, n) {
    var t = n <= 1 ? 0 : i / (n - 1);
    var from = [61, 15, 120], to = [85, 73, 156];
    return mix(from[0], to[0], t) + "," + mix(from[1], to[1], t) + "," + mix(from[2], to[2], t);
  }

  /* ---------- rendering ---------- */
  function render() {
    var editing = isEditing();
    document.body.classList.toggle("editing", editing);
    titleEl.textContent = state.title;
    titleEl.contentEditable = editing ? "true" : "false";

    if (!loaded) { boardEl.innerHTML = ""; return; }
    var list = sorted();
    if (!list.length) {
      boardEl.innerHTML = '<li class="empty">' + (loadError ? esc(loadError) : "No players yet." + (editing ? " Press “+ Add player” to start the board." : "")) + "</li>";
      return;
    }

    boardEl.innerHTML = list.map(function (p, i) {
      var initial = esc((p.name || "?").trim().charAt(0).toUpperCase() || "?");
      var inner = p.avatar ? '<img alt="" src="' + esc(p.avatar) + '">' : initial;
      var avatar = editing
        ? '<button class="avatar" type="button" data-act="avatar" aria-label="Change picture for ' + esc(p.name) + '">' + inner + "</button>"
        : '<div class="avatar">' + inner + "</div>";

      var nameHtml = editing
        ? '<input class="field name-field" data-act="name" value="' + esc(p.name) + '" maxlength="16" aria-label="Player name">'
        : '<div class="name">' + esc(p.name) + "</div>";

      var ptsHtml = editing
        ? '<div class="points">Points: <input class="field points-field" data-act="points" type="number" min="0" step="1" value="' + p.points + '" aria-label="Points for ' + esc(p.name) + '"></div>'
        : '<div class="points">Points: ' + pad(p.points, 4) + "</div>";

      var tools = editing
        ? '<div class="row-tools">' +
          '<button class="btn" type="button" data-act="plus10" aria-label="Add 10 points to ' + esc(p.name) + '">+10</button>' +
          '<button class="btn" type="button" data-act="minus10" aria-label="Remove 10 points from ' + esc(p.name) + '">−10</button>' +
          '<button class="btn danger" type="button" data-act="del" aria-label="Remove ' + esc(p.name) + '">Remove</button>' +
          "</div>"
        : "";

      return '<li class="row" data-id="' + esc(p.id) + '" style="--row-rgb:' + rowRgb(i, list.length) + '">' +
        '<div class="rank">' + pad(i + 1, 2) + "</div>" +
        avatar +
        '<div class="info">' + nameHtml + ptsHtml + "</div>" +
        tools +
        "</li>";
    }).join("");
  }

  /* ---------- background stars (steady upward drift + sway + twinkle) ---------- */
  (function stars() {
    var sky = $("sky");
    for (var i = 0; i < 42; i++) {
      var s = document.createElement("div");
      var size = [3, 3, 4, 6, 9, 12][Math.floor(Math.random() * 6)];
      // seconds to cross the screen: bigger = slower. Larger stars move a bit faster.
      var rise = 90 - size * 3 - Math.random() * 20;
      s.className = "star" + (Math.random() < 0.35 ? " purple" : "");
      s.style.width = s.style.height = size + "px";
      s.style.left = Math.random() * 100 + "%";
      s.style.setProperty("--rise", rise + "s");
      s.style.setProperty("--rise-delay", -Math.random() * rise + "s");
      s.style.setProperty("--sway", 7 + Math.random() * 8 + "s");
      s.style.setProperty("--sway-delay", -Math.random() * 10 + "s");
      s.style.setProperty("--twinkle", 3 + Math.random() * 4 + "s");
      s.style.setProperty("--twinkle-delay", -Math.random() * 4 + "s");
      sky.appendChild(s);
    }
  })();

  /* ---------- public page: load + auto refresh ---------- */
  function startPublic() {
    function pull(first) {
      fetchLive().then(applyLive).catch(function (err) {
        if (first) showLoadError(err);
      });
    }
    pull(true);
    setInterval(function () { pull(false); }, CONFIG.REFRESH_MS);
  }

  /* ---------- admin page ---------- */
  function sha256(text) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }
  function credHash(user, pass) { return sha256(CONFIG.SALT + "|" + user + "|" + pass); }

  function setLoggedIn(on) {
    loggedIn = on;
    $("login").hidden = on;
    $("dock").hidden = !on;
    $("adminNote").hidden = !on;
    render();
  }

  function readAvatar(file, cb) {
    if (!file) return cb(null);
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var size = 128, c = document.createElement("canvas");
        c.width = c.height = size;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, size, size);
        var s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        cb(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () { cb(null); };
      img.src = fr.result;
    };
    fr.onerror = function () { cb(null); };
    fr.readAsDataURL(file);
  }

  function findPlayer(el) {
    var row = el.closest(".row");
    if (!row) return null;
    var id = row.getAttribute("data-id");
    return state.players.filter(function (p) { return p.id === id; })[0] || null;
  }

  function startAdmin() {
    window.wedenHash = function (user, pass) {
      return credHash(user, pass).then(function (h) { console.log(h); return h; });
    };

    /* data: draft first, otherwise the live file */
    var draft = loadDraft();
    if (draft) { state = draft; loaded = true; render(); }
    else { fetchLive().then(applyLive).catch(showLoadError); }

    /* login */
    var loginBtn = $("loginBtn"), loginErr = $("loginErr");
    function tryLogin() {
      if (!window.crypto || !crypto.subtle) {
        loginErr.textContent = "Sign-in needs https or localhost. Open the site over https.";
        return;
      }
      var u = $("user").value.trim(), p = $("pass").value;
      if (!u || !p) { loginErr.textContent = "Enter your username and password."; return; }
      loginBtn.disabled = true;
      credHash(u, p).then(function (h) {
        if (h === CONFIG.ADMIN_HASH) {
          failedLogins = 0;
          try { sessionStorage.setItem(CONFIG.SESSION_KEY, "1"); } catch (e) {}
          $("pass").value = "";
          loginErr.textContent = "";
          loginBtn.disabled = false;
          setLoggedIn(true);
        } else {
          failedLogins++;
          loginErr.textContent = "Wrong username or password.";
          setTimeout(function () { loginBtn.disabled = false; }, Math.min(failedLogins, 5) * 1000);
        }
      });
    }
    loginBtn.addEventListener("click", tryLogin);
    $("login").addEventListener("keydown", function (e) { if (e.key === "Enter") tryLogin(); });

    $("logoutBtn").addEventListener("click", function () {
      try { sessionStorage.removeItem(CONFIG.SESSION_KEY); } catch (e) {}
      setLoggedIn(false);
    });

    var remembered = false;
    try { remembered = sessionStorage.getItem(CONFIG.SESSION_KEY) === "1"; } catch (e) {}
    setLoggedIn(remembered);

    /* title */
    titleEl.addEventListener("input", function () {
      if (!isEditing()) return;
      state.title = titleEl.textContent.trim().slice(0, 24) || "1K ROBUX";
      saveDraft();
    });
    titleEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); titleEl.blur(); }
    });

    /* row actions */
    boardEl.addEventListener("click", function (e) {
      if (!isEditing()) return;
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var p = findPlayer(btn);
      if (!p) return;
      var act = btn.getAttribute("data-act");
      if (act === "plus10") p.points += 10;
      else if (act === "minus10") p.points = Math.max(0, p.points - 10);
      else if (act === "del") state.players = state.players.filter(function (x) { return x.id !== p.id; });
      else if (act === "avatar") { avatarTargetId = p.id; $("rowFile").click(); return; }
      else return;
      saveDraft(); render();
    });
    boardEl.addEventListener("change", function (e) {
      if (!isEditing()) return;
      var el = e.target.closest("[data-act]");
      if (!el) return;
      var p = findPlayer(el);
      if (!p) return;
      var act = el.getAttribute("data-act");
      if (act === "name") {
        p.name = el.value.trim() || p.name;
      } else if (act === "points") {
        var v = parseInt(el.value, 10);
        p.points = isNaN(v) ? 0 : Math.max(0, v);
      } else return;
      saveDraft(); render();
    });
    $("rowFile").addEventListener("change", function (e) {
      var file = e.target.files[0];
      e.target.value = "";
      if (!file || !avatarTargetId || !isEditing()) return;
      readAvatar(file, function (data) {
        var p = state.players.filter(function (x) { return x.id === avatarTargetId; })[0];
        if (p && data) { p.avatar = data; saveDraft(); render(); }
      });
    });

    /* add player dialog */
    var dlg = $("dlg"), newName = $("newName"), newPoints = $("newPoints"),
        newPreview = $("newPreview"), err = $("err");

    function resetDialog() {
      newName.value = ""; newPoints.value = "0"; pendingAvatar = null;
      newPreview.textContent = "?"; $("newFile").value = ""; err.textContent = "";
    }
    $("addBtn").addEventListener("click", function () {
      if (!isEditing()) return;
      resetDialog();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
      newName.focus();
    });
    $("cancelBtn").addEventListener("click", function () { dlg.close(); });
    $("newFile").addEventListener("change", function (e) {
      readAvatar(e.target.files[0], function (data) {
        pendingAvatar = data;
        newPreview.innerHTML = data ? '<img alt="" src="' + esc(data) + '">' : "?";
      });
    });
    newName.addEventListener("input", function () {
      if (!pendingAvatar) newPreview.textContent = newName.value.trim().charAt(0).toUpperCase() || "?";
    });
    function submit() {
      var name = newName.value.trim();
      if (!name) { err.textContent = "Enter a player name."; newName.focus(); return; }
      var pts = parseInt(newPoints.value, 10);
      if (isNaN(pts) || pts < 0) { err.textContent = "Points must be 0 or higher."; newPoints.focus(); return; }
      state.players.push({ id: uid(), name: name, points: pts, avatar: pendingAvatar });
      saveDraft(); render(); dlg.close();
    }
    $("saveBtn").addEventListener("click", submit);
    dlg.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "file") {
        e.preventDefault(); submit();
      }
    });

    /* publish / discard */
    $("downloadBtn").addEventListener("click", function () {
      var text = "window.WEDEN_DATA = " + JSON.stringify(state, null, 2) + ";\n";
      var blob = new Blob([text], { type: "text/javascript" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "players.js";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    $("discardBtn").addEventListener("click", function () {
      if (!window.confirm("Discard your draft and reload the live leaderboard?")) return;
      try { localStorage.removeItem(CONFIG.DRAFT_KEY); } catch (e) {}
      fetchLive().then(applyLive).catch(showLoadError);
    });
  }

  /* ---------- start ---------- */
  if (isAdminPage) startAdmin(); else startPublic();
})();
