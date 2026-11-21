/* Shared engine for every lesson page.
   One implementation, driven by window.LESSON (see assets/lessons/<slug>.js).
   No inline handlers, no innerHTML of data, no third-party requests. */
(function () {
  'use strict';

  var L = window.LESSON;
  if (!L) return;

  var K = L.key;
  var TOTAL = L.lines.length;
  var LS = {
    mem: K + '_memorized',
    review: K + '_review',
    speed: K + '_speed',
    repeat: K + '_repeat',
    selftest: K + '_selftest',
    last: 'si_last_lesson',
    lastSeen: 'si_lesson_seen'
  };
  // 1, 3, 7, then 30 days — a light schedule, not a promise of retention
  var INTERVALS = [1, 3, 7, 30];

  /* Safari private mode and browsers with cookies blocked throw on localStorage access. Reading it
     unguarded at module scope killed the whole page — no cards, no play buttons, no message. Fall
     back to memory so the lesson still works, and tell the user progress will not be kept. */
  var store = (function () {
    try {
      var probe = '__si_probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return { get: function (k) { return window.localStorage.getItem(k); },
               set: function (k, v) { window.localStorage.setItem(k, v); },
               blocked: false };
    } catch (e) {
      var mem = {};
      return { get: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
               set: function (k, v) { mem[k] = String(v); },
               blocked: true };
    }
  }());

  var state = {
    memorized: readArray(LS.mem),
    review: readObject(LS.review),
    speed: parseFloat(store.get(LS.speed)) || 1,
    repeat: parseInt(store.get(LS.repeat), 10) || 1,
    selftest: store.get(LS.selftest) === '1',
    playing: null,
    queue: [],
    queueIndex: 0,
    repeatLeft: 0,
    justCompleted: false,
    reviewing: false
  };

  var $ = function (id) { return document.getElementById(id); };

  function readArray(key) {
    try {
      var v = JSON.parse(store.get(key) || '[]');
      if (!Array.isArray(v)) return [];
      // stale indices from an older line count are dropped, and duplicates removed, so progress
      // can never exceed 100% and two taps on the same line cannot double count
      var seen = {};
      return v.filter(function (i) {
        if (!Number.isInteger(i) || i < 0 || i >= TOTAL || seen[i]) return false;
        seen[i] = 1;
        return true;
      });
    } catch (e) { return []; }
  }
  function readObject(key) {
    try {
      var v = JSON.parse(store.get(key) || '{}');
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
  }
  function save() {
    try {
      store.set(LS.mem, JSON.stringify(state.memorized));
      store.set(LS.review, JSON.stringify(state.review));
      store.set(LS.lastSeen, String(Date.now()));
      store.set(LS.last, L.slug);
    } catch (e) { /* quota or blocked storage must never break marking a line */ }
  }

  /* ---------- spaced review ---------- */
  function daysSince(iso) {
    if (!iso) return Infinity;
    return (Date.now() - new Date(iso).getTime()) / 86400000;
  }
  function dueLines() {
    var out = [];
    state.memorized.forEach(function (i) {
      var rec = state.review[i] || {};
      var step = rec.step || 0;
      var need = INTERVALS[Math.min(step, INTERVALS.length - 1)];
      if (daysSince(rec.last) >= need) out.push(i);
    });
    return out.sort(function (a, b) { return a - b; });
  }

  /* ---------- audio ---------- */
  function audioUrl(i) {
    return L.audioBase + 'line_' + (i + 1) + '.mp3?' + L.cacheBust;
  }

  function stopAudio() {
    state.queue = [];
    if (state.playing) {
      try { state.playing.pause(); } catch (e) {}
      state.playing = null;
    }
    document.querySelectorAll('.btn-line-play').forEach(function (b) {
      b.classList.remove('playing');
    });
    resetPlayAll();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  function resetPlayAll() {
    var btn = $('playAll');
    if (btn) {
      btn.textContent = '🔊 Play Full Dua';
      btn.setAttribute('aria-pressed', 'false');
    }
  }

  function setMediaSession(title) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: title || L.title,
        artist: L.arabicTitle,
        album: 'Duas — line by line',
        artwork: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.setActionHandler('play', function () { playQueue(state.queue.length ? state.queue : allIndices(), 0, L.title); });
      navigator.mediaSession.setActionHandler('pause', stopAudio);
      navigator.mediaSession.setActionHandler('stop', stopAudio);
      navigator.mediaSession.setActionHandler('previoustrack', function () { stepLine(-1); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { stepLine(1); });
    } catch (e) {}
  }
  function stepLine(dir) {
    if (!state.queue.length) { playQueue(allIndices(), 0); return; }
    var next = Math.min(Math.max(state.queueIndex + dir, 0), state.queue.length - 1);
    playQueue(state.queue.slice(), next);
  }
  function allIndices() {
    var a = []; for (var i = 0; i < TOTAL; i++) a.push(i); return a;
  }

  function playQueue(list, startAt, label) {
    stopAudio();
    state.queue = list.slice();
    state.reviewing = false;
    state.queueIndex = startAt || 0;
    state.repeatLeft = state.repeat - 1;
    setMediaSession(label);
    playNext();
  }

  function playNext() {
    if (state.queueIndex >= state.queue.length) { stopAudio(); return; }
    var idx = state.queue[state.queueIndex];
    var btn = $('playbtn-' + idx);
    if (btn) btn.classList.add('playing');
    var audio = new Audio(audioUrl(idx));
    audio.playbackRate = state.speed;
    state.playing = audio;
    audio.onended = function () {
      if (btn) btn.classList.remove('playing');
      if (state.repeatLeft > 0) { state.repeatLeft--; state.playing = null; playNext(); return; }
      if (state.reviewing) markReviewed(idx);
      state.repeatLeft = state.repeat - 1;
      state.queueIndex++;
      state.playing = null;
      playNext();
    };
    audio.onerror = function () {
      if (btn) btn.classList.remove('playing');
      toast('Audio failed to load — check your connection');
      stopAudio();
    };
    audio.play().catch(function () {
      if (btn) btn.classList.remove('playing');
      toast('Tap Play to start audio');
      stopAudio();
    });
    toast('Line ' + (idx + 1) + ' of ' + TOTAL);
  }

  /* ---------- cards ---------- */
  function buildCards() {
    var box = $('cards');
    var due = dueLines();
    box.textContent = '';
    L.lines.forEach(function (l, i) {
      var isMem = state.memorized.indexOf(i) >= 0;
      var isDue = due.indexOf(i) >= 0;
      var card = document.createElement('div');
      card.className = 'card ' + (isMem ? 'memorized' : 'unlocked') + (isDue ? ' due' : '') +
        (state.selftest && !isMem ? ' selftest' : '');
      card.dataset.index = String(i);

      var num = document.createElement('span');
      num.className = 'line-num';
      num.textContent = 'Line ' + (i + 1) + ' of ' + TOTAL;
      card.appendChild(num);

      if (isDue) {
        var db = document.createElement('span');
        db.className = 'due-badge';
        db.textContent = 'review';
        card.appendChild(db);
      }

      var masked = state.selftest && !isMem;
      var ar = document.createElement('div');
      ar.className = 'arabic';
      ar.lang = 'ar';
      ar.dir = 'rtl';
      // in self-test the answer is not in the DOM at all until the learner reveals it
      ar.textContent = masked ? '•••••••••••' : l.arabic;
      card.appendChild(ar);

      var tr = document.createElement('div');
      tr.className = 'translit';
      tr.textContent = masked ? '••••••••' : l.translit;
      card.appendChild(tr);

      var me = document.createElement('div');
      me.className = 'meaning';
      me.textContent = l.meaning;
      card.appendChild(me);

      if (state.selftest && !isMem) {
        var hint = document.createElement('div');
        hint.className = 'selftest-hint';
        hint.textContent = 'Say it before you look — tap the card to reveal';
        card.insertBefore(hint, ar);
        card.addEventListener('click', function (ev) {
          if (ev.target.closest('button')) return;
          card.classList.add('revealed');
          ar.textContent = l.arabic;
          tr.textContent = l.translit;
        });
      }

      var actions = document.createElement('div');
      actions.className = 'card-actions';

      var play = document.createElement('button');
      play.type = 'button';
      play.className = 'btn-line-play';
      play.id = 'playbtn-' + i;
      play.textContent = '🔊 Play';
      play.setAttribute('aria-label', 'Play line ' + (i + 1));
      play.addEventListener('click', function () { playQueue([i], 0); });
      actions.appendChild(play);

      var mem = document.createElement('button');
      mem.type = 'button';
      mem.className = 'btn-memorized' + (isMem ? ' done' : '');
      mem.textContent = isMem ? '✓ Memorized' : '☐ Mark Memorized';
      mem.setAttribute('aria-pressed', isMem ? 'true' : 'false');
      mem.addEventListener('click', function () { toggleMem(i); });
      actions.appendChild(mem);

      card.appendChild(actions);
      box.appendChild(card);
    });
    updateProgress();
    updateReviewBanner();
  }

  function updateProgress() {
    var pct = TOTAL ? (state.memorized.length / TOTAL) * 100 : 0;
    if (!isFinite(pct)) pct = 0;
    pct = Math.max(0, Math.min(100, pct));
    var fill = $('progressFill');
    if (fill) fill.style.width = pct + '%';
    var text = $('progressText');
    if (text) text.textContent = state.memorized.length + ' / ' + TOTAL + ' memorized';
    var bar = $('progressBar');
    if (bar) bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (state.memorized.length === TOTAL && state.justCompleted) {
      state.justCompleted = false;
      setTimeout(function () { var c = $('completion'); if (c) c.classList.add('show'); }, 350);
    }
  }

  function updateReviewBanner() {
    var n = dueLines().length;
    var b = $('reviewBanner');
    if (!b) return;
    b.classList.toggle('show', n > 0);
    var t = $('reviewText');
    if (t) t.textContent = n === 1 ? '1 line is due for review.' : n + ' lines are due for review.';
  }

  function toggleMem(i) {
    var at = state.memorized.indexOf(i);
    if (at >= 0) {
      state.memorized.splice(at, 1);
      delete state.review[i];
    } else {
      state.memorized.push(i);
      state.review[i] = { last: new Date().toISOString(), step: 0 };
      state.justCompleted = state.memorized.length === TOTAL;
    }
    save();
    buildCards();
  }

  function markReviewed(i) {
    var rec = state.review[i] || { last: new Date().toISOString(), step: 0 };
    rec.last = new Date().toISOString();
    rec.step = Math.min((rec.step || 0) + 1, INTERVALS.length - 1);
    state.review[i] = rec;
    save();
  }

  /* ---------- controls ---------- */
  function setSpeed(s, btn) {
    state.speed = s;
    try { store.set(LS.speed, String(s)); } catch (e) {}
    document.querySelectorAll('.speed-btn').forEach(function (b) {
      var on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (state.playing) state.playing.playbackRate = s;
    save();
  }

  function setRepeat(n, btn) {
    state.repeat = n;
    try { store.set(LS.repeat, String(n)); } catch (e) {}
    document.querySelectorAll('[data-repeat]').forEach(function (b) {
      var on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    save();
  }

  /* The heading repeats the dua, so in self-test it is replaced by a placeholder rather than just
     blurred — a blurred block still hints at the shape of the answer. */
  function maskHeader(on) {
    var h1 = document.querySelector('header h1');
    var sub = document.querySelector('header .sub');
    [[h1, '••••••••••'], [sub, '••••••••••••••••']].forEach(function (pair) {
      var el = pair[0];
      if (!el) return;
      if (el.dataset.real === undefined) el.dataset.real = el.textContent;
      el.textContent = on ? pair[1] : el.dataset.real;
      el.style.filter = 'none';
    });
  }

  function toggleSelfTest(btn) {
    state.selftest = !state.selftest;
    try { store.set(LS.selftest, state.selftest ? '1' : '0'); } catch (e) {}
    if (btn) btn.setAttribute('aria-pressed', state.selftest ? 'true' : 'false');
    document.body.classList.toggle('selftest-on', state.selftest);
    maskHeader(state.selftest);
    buildCards();
    if (!state.selftest) toast('Self-test off');
  }

  function playFull() {
    playQueue(allIndices(), 0, L.title + ' — full');
    var btn = $('playAll');
    if (btn) {
      btn.textContent = '⏸ Playing full dua';
      btn.setAttribute('aria-pressed', 'true');
    }
    toast('Full dua — one clip per line');
  }

  var resetArmed = 0;

  function resetProgress() {
    var btn = $('resetBtn');
    // Native confirm() blocks in-app browsers (and can leave a page unresponsive), so the button
    // itself asks for a second tap, then disarms after a few seconds.
    if (!resetArmed) {
      resetArmed = Date.now();
      if (btn) {
        btn.textContent = '⚠️ Tap again to reset';
        btn.classList.add('armed');
      }
      toast('Tap again to reset this dua');
      setTimeout(function () {
        if (resetArmed) {
          resetArmed = 0;
          if (btn) {
            btn.textContent = '↺ Reset progress';
            btn.classList.remove('armed');
          }
        }
      }, 5000);
      return;
    }
    if (Date.now() - resetArmed > 5000) {
      resetArmed = 0;
      return resetProgress();
    }
    resetArmed = 0;
    if (btn) {
      btn.textContent = '↺ Reset progress';
      btn.classList.remove('armed');
    }
    state.memorized = [];
    state.review = {};
    save();
    buildCards();
    toast('This dua reset — other lessons unchanged');
  }

  function closeCompletion() {
    var c = $('completion');
    if (c) c.classList.remove('show');
  }

  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ---------- wiring ---------- */
  function init() {
    $('playAll').addEventListener('click', playFull);
    $('resetBtn').addEventListener('click', resetProgress);
    $('closeCompletion').addEventListener('click', closeCompletion);
    document.querySelectorAll('.speed-btn').forEach(function (b) {
      var s = parseFloat(b.dataset.speed);
      var on = Math.abs(s - state.speed) < 0.001;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', function () { setSpeed(s, b); });
    });
    document.querySelectorAll('[data-repeat]').forEach(function (b) {
      var n = parseInt(b.dataset.repeat, 10);
      var on = n === state.repeat;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.addEventListener('click', function () { setRepeat(n, b); });
    });
    var st = $('selfTestBtn');
    if (st) {
      st.setAttribute('aria-pressed', state.selftest ? 'true' : 'false');
      st.addEventListener('click', function () { toggleSelfTest(st); });
    }
    var rv = $('reviewBtn');
    if (rv) rv.addEventListener('click', function () {
      var list = dueLines();
      if (!list.length) { toast('Nothing due right now'); return; }
      // the schedule advances as each line finishes playing, not when the button is tapped —
      // stopping halfway must not count as having reviewed the rest
      playQueue(list, 0, L.title + ' — review');
      state.reviewing = true;
      buildCards();
    });
    var dl = $('downloadBtn');
    if (dl) dl.setAttribute('href', 'downloads/' + L.slug + '.zip');

    // the page heading repeats the dua, so in self-test it is blurred too — otherwise the
    // answer sits in plain sight above the test. Tapping the heading reveals it.
    var head = document.querySelector('header');
    if (head) {
      head.addEventListener('click', function () {
        head.classList.toggle('revealed');
        maskHeader(state.selftest && !head.classList.contains('revealed'));
      });
    }
    document.body.classList.toggle('selftest-on', state.selftest);
    maskHeader(state.selftest);

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', playFull);
        navigator.mediaSession.setActionHandler('pause', stopAudio);
      } catch (e) {}
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) save(); });
    buildCards();
    save();
    if (store.blocked) {
      toast('Progress cannot be saved in this browser — private mode?');
    }
  }

  window.LESSON_UI = { stop: stopAudio, playQueue: playQueue };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
