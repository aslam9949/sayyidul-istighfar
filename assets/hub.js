/* Hub: per-lesson progress rings, search, occasion filters and a resume card.
   Everything is read from localStorage only — no analytics, no network. */
(function () {
  'use strict';

  var LESSONS = window.LESSONS || [];
  var search = document.getElementById('search');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.tag-chip'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('.pick'));
  var empty = document.getElementById('empty');
  var resume = document.getElementById('resume');
  var resumeLink = document.getElementById('resumeLink');
  var resumeName = document.getElementById('resumeName');

  /* ---- progress rings ---- */
  LESSONS.forEach(function (l) {
    var done = 0;
    try {
      var raw = JSON.parse(localStorage.getItem(l.key + '_memorized') || '[]');
      if (Array.isArray(raw)) {
        done = raw.filter(function (i) { return Number.isInteger(i) && i >= 0 && i < l.lines; }).length;
      }
    } catch (e) {}
    var pct = l.lines ? Math.round((done / l.lines) * 100) : 0;
    var ring = document.querySelector('[data-ring="' + l.key + '"]');
    if (!ring) return;
    var fill = ring.querySelector('.ring-fill');
    var label = ring.querySelector('.label');
    var C = 2 * Math.PI * 22;
    if (fill) {
      fill.setAttribute('stroke-dashoffset', String(C * (1 - pct / 100)));
      // set both branches: the ring used to stay green after progress was reset
      fill.setAttribute('stroke', pct === 100 ? '#4caf50' : '#c9a84c');
    }
    if (label) label.textContent = pct + '%';
    ring.setAttribute('aria-label', pct + '% memorised');
  });

  /* ---- resume ---- */
  try {
    var last = localStorage.getItem('si_last_lesson');
    var seen = parseInt(localStorage.getItem('si_lesson_seen') || '0', 10);
    var match = LESSONS.filter(function (l) { return l.slug === last; })[0];
    if (match && seen && Date.now() - seen < 1000 * 60 * 60 * 24 * 30) {
      resumeLink.href = match.slug + '.html';
      resumeName.textContent = match.title;
      resume.classList.add('show');
    }
  } catch (e) {}

  /* ---- search + tag filter ---- */
  var activeTag = null;

  function apply() {
    var q = (search && search.value || '').trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var hay = (card.dataset.title || '') + ' ' + (card.dataset.tags || '') + ' ' +
        (card.textContent || '').toLowerCase();
      var okText = !q || hay.indexOf(q) >= 0;
      var okTag = !activeTag || (card.dataset.tags || '').split(',').indexOf(activeTag) >= 0;
      var show = okText && okTag;
      card.style.display = show ? '' : 'none';
      if (show) shown++;
    });
    if (empty) empty.classList.toggle('show', shown === 0);
  }

  if (search) {
    var t = null;
    search.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(apply, 90);
    });
  }
  /* ---- pinned duas: ordered shelf with reorder + remove ----
     Order lives in one list (si_pins). Buttons rather than drag-and-drop: a drag target on a
     phone-sized row is a reach problem, and a mis-drop would silently reorder someone's duas. */
  var pinsWrap = document.getElementById('pinnedWrap');
  var pinsList = document.getElementById('pinnedList');
  var pinsCount = document.getElementById('pinnedCount');
  var PIN_KEY = 'si_pins';

  function readPins() {
    try {
      var v = JSON.parse(localStorage.getItem(PIN_KEY) || '[]');
      if (!Array.isArray(v)) return [];
      var known = LESSONS.map(function (l) { return l.slug; });
      var seen = {};
      return v.filter(function (s) {
        if (typeof s !== 'string' || seen[s] || known.indexOf(s) < 0) return false;
        seen[s] = 1;
        return true;
      });
    } catch (e) { return []; }
  }
  function writePins(list) {
    try { localStorage.setItem(PIN_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function pinBtn(label, aria, cls, fn, disabled) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pin-act' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    // first row cannot move up, last cannot move down: show that instead of a button that does
    // nothing when tapped
    if (disabled) {
      b.disabled = true;
      b.setAttribute('aria-disabled', 'true');
    }
    b.addEventListener('click', fn);
    return b;
  }

  function renderPins() {
    if (!pinsWrap || !pinsList) return;
    var pins = readPins();
    // mark the main list so a pinned lesson is recognisable in context
    Array.prototype.slice.call(document.querySelectorAll('.pick')).forEach(function (card) {
      var on = pins.indexOf(card.dataset.slug) >= 0;
      card.classList.toggle('is-pinned', on);
      var star = card.querySelector('.pin-star');
      if (on && !star) {
        star = document.createElement('span');
        star.className = 'pin-star';
        star.textContent = '📌';
        card.appendChild(star);
      } else if (!on && star) {
        star.remove();
      }
    });
    if (!pins.length) {
      pinsWrap.classList.remove('show');
      pinsList.textContent = '';
      return;
    }
    pinsWrap.classList.add('show');
    if (pinsCount) {
      pinsCount.textContent = pins.length + (pins.length === 1 ? ' dua' : ' duas');
    }
    pinsList.textContent = '';
    pins.forEach(function (slug, i) {
      var lesson = LESSONS.filter(function (l) { return l.slug === slug; })[0];
      if (!lesson) return;
      var row = document.createElement('div');
      row.className = 'pin-row';
      var a = document.createElement('a');
      a.className = 'pin-link';
      a.href = slug + '.html';
      a.textContent = lesson.title;
      row.appendChild(a);
      var tools = document.createElement('div');
      tools.className = 'pin-tools';
      tools.appendChild(pinBtn('↑', 'Move ' + lesson.title + ' up', 'up', function () {
        var list = readPins();
        var at = list.indexOf(slug);
        if (at > 0) { list.splice(at - 1, 0, list.splice(at, 1)[0]); writePins(list); }
        renderPins();
      }, i === 0));
      tools.appendChild(pinBtn('↓', 'Move ' + lesson.title + ' down', 'down', function () {
        var list = readPins();
        var at = list.indexOf(slug);
        if (at >= 0 && at < list.length - 1) { list.splice(at + 1, 0, list.splice(at, 1)[0]); writePins(list); }
        renderPins();
      }, i === pins.length - 1));
      tools.appendChild(pinBtn('✕', 'Unpin ' + lesson.title, 'rm', function () {
        var list = readPins().filter(function (s) { return s !== slug; });
        writePins(list);
        renderPins();
        toast('Unpinned ' + lesson.title);
      }));
      row.appendChild(tools);
      pinsList.appendChild(row);
    });
  }

  /* ---- backup / restore -------------------------------------------------
     Progress lives only in this browser, so clearing site data loses it. A small JSON file is
     enough to move it between devices, and it keeps the privacy promise: no account, no upload. */
  var backupBtn = document.getElementById('backupBtn');
  var restoreBtn = document.getElementById('restoreBtn');
  var restoreFile = document.getElementById('restoreFile');
  var clearAudioBtn = document.getElementById('clearAudioBtn');
  var offlineNote = document.getElementById('offlineNote');
  var toastEl = document.getElementById('toast');
  var pending = null;

  function safeGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function safeSet(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  function collect() {
    var out = { app: 'sayyidul-istighfar', version: 1, exportedAt: new Date().toISOString(), lessons: {} };
    LESSONS.forEach(function (l) {
      var rec = { memorized: [], review: {}, speed: 1, repeat: 1, selftest: false };
      try {
        var m = JSON.parse(safeGet(l.key + '_memorized') || '[]');
        if (Array.isArray(m)) {
          rec.memorized = m.filter(function (i) { return Number.isInteger(i) && i >= 0 && i < l.lines; });
        }
        var rv = JSON.parse(safeGet(l.key + '_review') || '{}');
        if (rv && typeof rv === 'object' && !Array.isArray(rv)) rec.review = rv;
        rec.speed = parseFloat(safeGet(l.key + '_speed')) || 1;
        rec.repeat = parseInt(safeGet(l.key + '_repeat'), 10) || 1;
        rec.selftest = safeGet(l.key + '_selftest') === '1';
      } catch (e) {}
      out.lessons[l.key] = rec;
    });
    out.pins = readPins();
    out.last = safeGet('si_last_lesson');
    out.lastSeen = parseInt(safeGet('si_lesson_seen') || '0', 10) || 0;
    return out;
  }

  if (backupBtn) {
    backupBtn.addEventListener('click', function () {
      var data = collect();
      var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'duas-progress-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      var n = 0;
      Object.keys(data.lessons).forEach(function (k) { n += data.lessons[k].memorized.length; });
      toast('Backup saved — ' + n + ' memorised line' + (n === 1 ? '' : 's'));
    });
  }

  function sanitise(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.app !== 'sayyidul-istighfar' || !raw.lessons || typeof raw.lessons !== 'object') return null;
    var clean = { app: raw.app, version: 1, exportedAt: raw.exportedAt || null, lessons: {} };
    var total = 0;
    LESSONS.forEach(function (l) {
      var src = raw.lessons[l.key];
      if (!src || typeof src !== 'object') return;
      var mem = Array.isArray(src.memorized) ? src.memorized : [];
      var seen = {};
      mem = mem.filter(function (i) {
        if (!Number.isInteger(i) || i < 0 || i >= l.lines || seen[i]) return false;
        seen[i] = 1;
        return true;
      });
      var review = {};
      if (src.review && typeof src.review === 'object') {
        Object.keys(src.review).forEach(function (k) {
          var idx = parseInt(k, 10);
          if (!Number.isInteger(idx) || idx < 0 || idx >= l.lines) return;
          var rec = src.review[k] || {};
          var last = typeof rec.last === 'string' && !isNaN(new Date(rec.last).getTime())
            ? rec.last : new Date().toISOString();
          var step = Number.isInteger(rec.step) ? Math.max(0, Math.min(3, rec.step)) : 0;
          review[idx] = { last: last, step: step };
        });
      }
      var speed = [0.5, 1, 1.5].indexOf(parseFloat(src.speed)) >= 0 ? parseFloat(src.speed) : 1;
      var repeat = [1, 3, 5].indexOf(parseInt(src.repeat, 10)) >= 0 ? parseInt(src.repeat, 10) : 1;
      clean.lessons[l.key] = { memorized: mem, review: review, speed: speed,
                               repeat: repeat, selftest: src.selftest === true };
      total += mem.length;
    });
    var slugs = LESSONS.map(function (l) { return l.slug; });
    var pins = Array.isArray(raw.pins) ? raw.pins.filter(function (s) {
      return typeof s === 'string' && slugs.indexOf(s) >= 0;
    }) : [];
    clean.pins = pins.filter(function (s, i) { return pins.indexOf(s) === i; });
    clean.last = slugs.indexOf(raw.last) >= 0 ? raw.last : null;
    clean.lastSeen = Number.isInteger(raw.lastSeen) && raw.lastSeen > 0 ? raw.lastSeen : 0;
    clean.count = total;
    return clean;
  }

  if (restoreBtn && restoreFile) {
    restoreBtn.addEventListener('click', function () {
      if (!pending) { restoreFile.click(); return; }
      // second tap = apply, so a stray tap can never overwrite progress
      var data = pending;
      pending = null;
      restoreBtn.textContent = '⤒ Restore';
      var written = 0;
      Object.keys(data.lessons).forEach(function (k) {
        var rec = data.lessons[k];
        if (safeSet(k + '_memorized', JSON.stringify(rec.memorized))) written++;
        safeSet(k + '_review', JSON.stringify(rec.review));
        safeSet(k + '_speed', String(rec.speed));
        safeSet(k + '_repeat', String(rec.repeat));
        safeSet(k + '_selftest', rec.selftest ? '1' : '0');
      });
      if (data.pins) writePins(data.pins);
      if (data.last) safeSet('si_last_lesson', data.last);
      if (data.lastSeen) safeSet('si_lesson_seen', String(data.lastSeen));
      toast(written ? 'Restored ' + data.count + ' memorised lines — reloading' : 'Nothing to restore');
      setTimeout(function () { location.reload(); }, 900);
    });

    restoreFile.addEventListener('change', function () {
      var f = restoreFile.files && restoreFile.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed = null;
        try { parsed = sanitise(JSON.parse(String(reader.result))); } catch (e) { parsed = null; }
        if (!parsed) { toast('That file is not a duas backup'); restoreFile.value = ''; return; }
        pending = parsed;
        restoreBtn.textContent = '⚠️ Restore ' + parsed.count + ' lines?';
        toast('Tap Restore again to confirm');
        setTimeout(function () {
          if (pending === parsed) { pending = null; restoreBtn.textContent = '⤒ Restore'; }
        }, 8000);
      };
      reader.onerror = function () { toast('Could not read that file'); };
      reader.readAsText(f);
    });
  }

  /* ---- offline audio: how much is cached, and a way to free it ---- */
  function swPost(msg) {
    if (!('serviceWorker' in navigator)) return;
    var send = function (worker) { if (worker) worker.postMessage(msg); };
    if (navigator.serviceWorker.controller) { send(navigator.serviceWorker.controller); return; }
    navigator.serviceWorker.ready.then(function (reg) { send(reg.active); }).catch(function () {});
  }

  function renderAudio(stats) {
    if (!offlineNote) return;
    var mb = (stats.bytes / (1024 * 1024)).toFixed(1);
    offlineNote.textContent = stats.count
      ? 'Offline audio: ' + stats.count + ' clip' + (stats.count === 1 ? '' : 's') + ' · ' + mb +
        ' MB cached (limit 48 MB)'
      : 'Offline audio: nothing cached yet — play a dua once to keep it for offline.';
  }

  // ask the browser to keep this origin's storage: cached audio should not be evicted just
  // because the device got tight on space. Chrome/Android grant it silently for installed use.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(function (already) {
      if (!already) navigator.storage.persist().catch(function () {});
    }).catch(function () {});
  }

  if ('serviceWorker' in navigator) {
    // the hub is often the first page someone opens, and registration used to live only in
    // app.js — so the worker was never installed until a lesson was visited, leaving offline
    // unavailable and this note stuck on "checking…"
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'audio-stats') renderAudio(e.data);
    });
    navigator.serviceWorker.ready.then(function () {
      setTimeout(function () { swPost({ type: 'audio-stats' }); }, 400);
    }).catch(function () {});
    // if no answer arrives, say something useful rather than sitting on "checking…"
    setTimeout(function () {
      if (offlineNote && /checking/.test(offlineNote.textContent)) {
        offlineNote.textContent = 'Offline audio: play a dua once to keep it for offline.';
      }
    }, 4000);
  } else if (offlineNote) {
    offlineNote.textContent = 'This browser does not support offline mode.';
  }

  if (clearAudioBtn) {
    clearAudioBtn.addEventListener('click', function () {
      swPost({ type: 'clear-audio' });
      toast('Offline audio cleared — clips download again when played');
    });
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var tag = chip.dataset.tag;
      var on = activeTag === tag;
      activeTag = on ? null : tag;
      chips.forEach(function (c) {
        var isOn = c.dataset.tag === activeTag;
        c.classList.toggle('active', isOn);
        c.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      });
      apply();
    });
  });

  // after every declaration has actually run: the shelf reads pinsWrap/pinsList, and calling this
  // earlier (before those var assignments execute) silently returned and rendered nothing
  renderPins();

  // coming back from a lesson with the back button can restore this page from the bfcache without
  // re-running scripts, which would leave the shelf showing the pins you had before you pinned
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) {
      renderPins();
      if (typeof apply === 'function') apply();
    }
  });
})();
