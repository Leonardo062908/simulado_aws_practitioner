/*
 * Simulado AWS Certified Cloud Practitioner (CLF-C02)
 * Aplicação estática: HTML + CSS + JavaScript puro, sem dependências.
 * Questões: questions/*.json · Histórico e tentativa em andamento: localStorage.
 */
(function () {
  'use strict';

  /* ===================== Configuração ===================== */

  const CONFIG = {
    files: [
      'questions/d1-conceitos.json',
      'questions/d2-seguranca.json',
      'questions/d3-tecnologia.json',
      'questions/d4-precos.json',
    ],
    domains: {
      1: { name: 'Conceitos de nuvem', weight: 24, examCount: 16 },
      2: { name: 'Segurança e conformidade', weight: 30, examCount: 20 },
      3: { name: 'Tecnologia e serviços', weight: 34, examCount: 22 },
      4: { name: 'Cobrança, preços e suporte', weight: 12, examCount: 7 },
    },
    examSeconds: 90 * 60,
    secondsPerQuestion: 83, // ~1 min 23 s (90 min / 65 questões)
    passPct: 80, // meta com margem sobre o corte real (700/1000)
    warnSeconds: 10 * 60,
    practiceSizes: [10, 20, 30],
    historyMax: 100,
    historyDetailMax: 30,
  };

  const DOMAIN_IDS = [1, 2, 3, 4];
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const KEYS = {
    session: 'clf02.session',
    history: 'clf02.history',
    seen: 'clf02.seen',
    theme: 'clf02.theme',
    practice: 'clf02.practice',
  };

  /* ===================== Formatação ===================== */

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fmtClock(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
  }

  function fmtDuration(totalSec) {
    const s = Math.max(0, Math.round(totalSec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h} h ${pad2(m)} min`;
    if (m > 0) return sec ? `${m} min ${pad2(sec)} s` : `${m} min`;
    return `${sec} s`;
  }

  function fmtPct(value) {
    const v = Math.round(value * 10) / 10;
    return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  }

  function fmtDate(ms) {
    const d = new Date(ms);
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${d.toLocaleDateString('pt-BR')} ${time}`;
  }

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  }

  function linkify(text) {
    return esc(text).replace(
      /https?:\/\/[^\s<]*[^\s<.,;:!?)\]]/g,
      (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
  }

  function truncate(text, max) {
    const t = String(text).replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
  }

  // As explicações começam com "Correta." ou "Incorreta."; na tela isso vira um selo.
  function stripVerdict(text) {
    return String(text || '').replace(/^\s*(?:correta|incorreta)\s*[.:!–—-]?\s*/i, '');
  }

  function optionOf(q, key) {
    return q.options.find((o) => o.key === key) || { key, text: key, explanation: '' };
  }

  function letterOf(item, key) {
    const i = item.order.indexOf(key);
    return i >= 0 ? LETTERS[i] : key;
  }

  /* ===================== Lógica (sem DOM) ===================== */

  function shuffle(list, rnd) {
    const a = list.slice();
    const r = rnd || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // Prioriza questões nunca vistas; depois, as vistas há mais tempo.
  function orderByFreshness(pool, seen, rnd) {
    const mixed = shuffle(pool, rnd);
    const fresh = mixed.filter((q) => !seen[q.id]);
    const old = mixed.filter((q) => seen[q.id]).sort((a, b) => seen[a.id] - seen[b.id]);
    return fresh.concat(old);
  }

  function pickExam(bank, seen, rnd) {
    let picked = [];
    DOMAIN_IDS.forEach((d) => {
      const pool = bank.filter((q) => q.domain === d);
      picked = picked.concat(orderByFreshness(pool, seen, rnd).slice(0, CONFIG.domains[d].examCount));
    });
    return shuffle(picked, rnd);
  }

  function filterPool(bank, domain, topic) {
    return bank.filter(
      (q) => (domain === 'all' || q.domain === Number(domain)) && (topic === 'all' || q.topic === topic)
    );
  }

  function pickPractice(bank, seen, opts, rnd) {
    const pool = filterPool(bank, opts.domain, opts.topic);
    return shuffle(orderByFreshness(pool, seen, rnd).slice(0, opts.count), rnd);
  }

  function sameAnswer(correct, answer) {
    if (!answer || answer.length !== correct.length) return false;
    const a = answer.slice().sort();
    const c = correct.slice().sort();
    return a.every((k, i) => k === c[i]);
  }

  function createSession(questions, meta, now, rnd) {
    const t = now || Date.now();
    return {
      v: 1,
      mode: meta.mode,
      label: meta.label,
      startedAt: t,
      durationSec: meta.seconds,
      endsAt: t + meta.seconds * 1000,
      items: questions.map((q) => ({ id: q.id, order: shuffle(q.options.map((o) => o.key), rnd) })),
      answers: {},
      marked: {},
      current: 0,
      warned: false,
      submittedAt: null,
      reason: null,
    };
  }

  function groupStats(rows, keyFn, labelFn) {
    const map = new Map();
    rows.forEach((r) => {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, { key: k, label: labelFn(r), correct: 0, total: 0 });
      const g = map.get(k);
      g.total += 1;
      if (r.correct) g.correct += 1;
    });
    return Array.from(map.values())
      .map((g) => Object.assign(g, { pct: g.total ? (g.correct / g.total) * 100 : 0 }))
      .sort((a, b) => a.pct - b.pct || b.total - a.total || String(a.label).localeCompare(String(b.label), 'pt-BR'));
  }

  function scoreSession(s, byId) {
    const rows = [];
    s.items.forEach((item, idx) => {
      const q = byId.get(item.id);
      if (!q) return;
      const ans = s.answers[item.id] || [];
      rows.push({ n: idx + 1, q, item, ans, answered: ans.length > 0, correct: sameAnswer(q.correct, ans) });
    });
    const total = rows.length;
    const correct = rows.filter((r) => r.correct).length;
    const unanswered = rows.filter((r) => !r.answered).length;
    const end = Math.min(s.submittedAt || Date.now(), s.endsAt);
    const usedSec = Math.max(0, Math.round((end - s.startedAt) / 1000));
    const pct = total ? (correct / total) * 100 : 0;
    return {
      rows,
      total,
      correct,
      wrong: total - correct,
      unanswered,
      pct,
      passed: pct >= CONFIG.passPct,
      usedSec,
      avgSec: total ? usedSec / total : 0,
      byDomain: groupStats(rows, (r) => r.q.domain, (r) => `D${r.q.domain} · ${CONFIG.domains[r.q.domain].name}`),
      byTopic: groupStats(rows, (r) => r.q.topic, (r) => r.q.topic),
    };
  }

  function buildMarkdown(s, sc) {
    const wrong = sc.rows.filter((r) => !r.correct);
    const out = [];
    out.push(`# Erros — ${s.label} — ${fmtDate(s.submittedAt || Date.now())}`);
    out.push('');
    out.push(`Nota: ${fmtPct(sc.pct)} (${sc.correct}/${sc.total} acertos) · ${wrong.length} erro(s)`);
    wrong.forEach((r, i) => {
      const q = r.q;
      const wrongPicks = r.ans.filter((k) => !q.correct.includes(k));
      let confused;
      if (!r.answered) {
        confused = 'Deixei a questão sem resposta.';
      } else if (wrongPicks.length) {
        confused = wrongPicks
          .map((k) => `Marquei "${optionOf(q, k).text}": ${stripVerdict(optionOf(q, k).explanation)}`)
          .join(' ');
      } else {
        const picked = r.ans.map((k) => `"${optionOf(q, k).text}"`).join(' e ');
        confused = `Marquei só ${picked} e não escolhi a outra opção correta.`;
      }
      const right = q.correct
        .map((k) => `"${optionOf(q, k).text}": ${stripVerdict(optionOf(q, k).explanation)}`)
        .join(' ');
      out.push('');
      out.push(`## ${i + 1}. D${q.domain} · ${q.topic} (questão ${r.n})`);
      out.push('');
      out.push(`> ${truncate(q.question, 100000)}`);
      out.push('');
      out.push(`- **Conceito que confundi:** ${confused}`);
      out.push(`- **Resposta correta e por quê:** ${right}`);
      out.push(`- **Como reconhecer numa questão:** ${q.trigger}`);
      out.push(`- Referência: ${q.reference}`);
    });
    return `${out.join('\n')}\n`;
  }

  const Logic = {
    CONFIG,
    shuffle,
    orderByFreshness,
    pickExam,
    filterPool,
    pickPractice,
    sameAnswer,
    createSession,
    scoreSession,
    buildMarkdown,
    fmtClock,
    fmtDuration,
    fmtPct,
    stripVerdict,
  };

  // Permite testar a lógica no Node: require('./app.js')
  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  if (typeof document === 'undefined') return;

  /* ===================== Navegador ===================== */

  const store = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        /* ignora */
      }
    },
  };

  const icon = (d) =>
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICONS = {
    sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>'),
    moon: icon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
    flag: icon('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
    clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    left: icon('<path d="M15 18l-6-6 6-6"/>'),
    right: icon('<path d="M9 18l6-6-6-6"/>'),
    copy: icon('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  };

  const $app = document.getElementById('app');
  let BANK = [];
  let BY_ID = new Map();
  let session = null; // tentativa em andamento
  let view = { name: 'loading' };
  let timerId = null;
  let toastTimer = null;

  /* ---------- Inicialização ---------- */

  async function init() {
    bindGlobalEvents();
    applyThemeButton();
    try {
      BANK = await loadBank();
    } catch (err) {
      renderLoadError(err);
      return;
    }
    BY_ID = new Map(BANK.map((q) => [q.id, q]));

    const saved = store.get(KEYS.session, null);
    const valid =
      saved && !saved.submittedAt && Array.isArray(saved.items) && saved.items.length &&
      saved.items.every((it) => BY_ID.has(it.id));
    if (valid) {
      session = saved;
      if (Date.now() >= session.endsAt) {
        finishSession('timeout');
      } else {
        // O aviso de retomada vem antes: se faltar pouco tempo, o alerta do cronômetro o substitui.
        toast('Tentativa em andamento retomada. O cronômetro continuou correndo.');
        showExam();
      }
      return;
    }
    if (saved) store.remove(KEYS.session);
    showHome();
  }

  async function loadBank() {
    const lists = await Promise.all(
      CONFIG.files.map(async (file) => {
        const res = await fetch(file, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Não foi possível carregar ${file} (HTTP ${res.status}).`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error(`${file} não contém uma lista de questões.`);
        return data;
      })
    );
    return lists.flat();
  }

  function renderLoadError(err) {
    const isFile = window.location.protocol === 'file:';
    $app.innerHTML = `
      <div class="banner banner--error">
        <h1>Não foi possível carregar as questões</h1>
        <p>${esc(err && err.message ? err.message : String(err))}</p>
        ${isFile ? '<p>Você abriu o arquivo direto do disco (file://). O navegador bloqueia a leitura dos JSON nesse modo.</p>' : ''}
        <p>Inicie um servidor local na pasta <strong>AWS_practitioner</strong> e abra o endereço que ele mostrar:</p>
        <p><kbd>npx serve .</kbd> &nbsp;ou&nbsp; <kbd>python -m http.server 3000</kbd></p>
      </div>`;
  }

  function bindGlobalEvents() {
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('brand').addEventListener('click', (e) => {
      e.preventDefault();
      if (session) {
        toast('Envie ou descarte a tentativa atual antes de voltar ao início.');
        return;
      }
      if (BANK.length) showHome();
    });
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && session) tick();
    });
    window.addEventListener('beforeunload', (e) => {
      if (session) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* ---------- Tema ---------- */

  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(KEYS.theme, next);
    } catch (e) {
      /* ignora */
    }
    applyThemeButton();
  }

  function applyThemeButton() {
    const btn = document.getElementById('theme-toggle');
    const dark = currentTheme() === 'dark';
    const label = dark ? 'Mudar para tema claro' : 'Mudar para tema escuro';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
  }

  /* ---------- Eventos ---------- */

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.dataset.action;
    switch (action) {
      case 'start-exam': startExam(); break;
      case 'start-practice': startPractice(); break;
      case 'prev': go(session.current - 1); break;
      case 'next': go(session.current + 1); break;
      case 'goto': go(Number(el.dataset.index)); break;
      case 'toggle-mark': toggleMark(); break;
      case 'review': showReview(); break;
      case 'back-to-exam': showExam(); break;
      case 'submit': finishSession('manual'); break;
      case 'discard': discardSession(); break;
      case 'home': showHome(); break;
      case 'copy-md': copyMarkdown(); break;
      case 'download-md': downloadMarkdown(); break;
      case 'retry-wrong': retryWrong(); break;
      case 'open-attempt': openAttempt(el.dataset.id); break;
      case 'clear-history': clearHistory(); break;
      case 'close-dialog': closeDialog(); break;
      default: break;
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.matches('input[data-opt]')) {
      onAnswerChange(t);
      return;
    }
    if (t.id === 'p-domain') {
      refreshTopicSelect();
      updatePracticeInfo();
      savePracticePrefs();
      return;
    }
    if (t.id === 'p-topic' || t.name === 'p-count') {
      updatePracticeInfo();
      savePracticePrefs();
    }
  }

  function onKey(e) {
    if (view.name !== 'exam' || !session) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'select' || tag === 'textarea' || (tag === 'input' && !t.matches('[data-opt]'))) return;
    if (document.getElementById('dlg').open) return;

    const k = e.key;
    if (k === 'ArrowRight') {
      e.preventDefault();
      go(session.current + 1);
      return;
    }
    if (k === 'ArrowLeft') {
      e.preventDefault();
      go(session.current - 1);
      return;
    }
    if (k === 'm' || k === 'M') {
      e.preventDefault();
      toggleMark();
      return;
    }
    if (k.length === 1) {
      const pos = LETTERS.indexOf(k.toUpperCase());
      const inputs = $app.querySelectorAll('input[data-opt]');
      if (pos < 0 || pos >= inputs.length) return;
      e.preventDefault();
      const input = inputs[pos];
      if (input.disabled) {
        toast('Limite atingido: desmarque uma opção para escolher outra.');
        return;
      }
      if (input.type === 'radio') {
        if (!input.checked) {
          input.checked = true;
          onAnswerChange(input);
        }
      } else {
        input.checked = !input.checked;
        onAnswerChange(input);
      }
    }
  }

  /* ---------- Início ---------- */

  function showHome() {
    stopTimer();
    clearTimerSlot();
    view = { name: 'home' };
    const seen = store.get(KEYS.seen, {});
    const unseen = BANK.filter((q) => !seen[q.id]).length;
    const prefs = Object.assign({ domain: 'all', topic: 'all', count: 10 }, store.get(KEYS.practice, {}));
    if (!CONFIG.practiceSizes.includes(prefs.count)) prefs.count = 10;
    const countByDomain = (d) => BANK.filter((q) => q.domain === d).length;

    $app.innerHTML = `
      <section class="home">
        <div class="hero">
          <p class="eyebrow">AWS Certified Cloud Practitioner · CLF-C02</p>
          <h1>Simulado em português</h1>
          <p class="lead">Questões originais no estilo da prova, sem gabarito durante a tentativa. A meta aqui é ${CONFIG.passPct}%, para ter margem sobre o corte real (700 de 1000).</p>
          <ul class="bank" aria-label="Banco de questões">
            <li><strong>${BANK.length}</strong> questões</li>
            ${DOMAIN_IDS.map((d) => `<li title="${esc(CONFIG.domains[d].name)}">D${d} <strong>${countByDomain(d)}</strong></li>`).join('')}
            <li><strong>${unseen}</strong> ainda não vistas</li>
          </ul>
        </div>

        <div class="modes">
          <article class="card mode">
            <h2>Prova completa</h2>
            <p class="muted">65 questões · 90 minutos · distribuição pelos pesos oficiais</p>
            <ul class="mode__list">
              ${DOMAIN_IDS.map((d) => `<li><span>D${d} · ${esc(CONFIG.domains[d].name)} (${CONFIG.domains[d].weight}%)</span><strong>${CONFIG.domains[d].examCount}</strong></li>`).join('')}
            </ul>
            <button type="button" class="btn btn--primary btn--block" data-action="start-exam">Iniciar prova completa</button>
          </article>

          <article class="card mode">
            <h2>Treino rápido</h2>
            <p class="muted">Escolha domínio, tópico e quantidade. Tempo de ~1 min 23 s por questão.</p>
            <div class="field">
              <label for="p-domain">Domínio</label>
              <select id="p-domain">
                <option value="all">Todos os domínios (${BANK.length})</option>
                ${DOMAIN_IDS.map((d) => `<option value="${d}">D${d} · ${esc(CONFIG.domains[d].name)} (${countByDomain(d)})</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="p-topic">Tópico</label>
              <select id="p-topic"></select>
            </div>
            <div class="field">
              <span class="field__label" id="p-count-label">Quantidade</span>
              <div class="segmented" role="radiogroup" aria-labelledby="p-count-label">
                ${CONFIG.practiceSizes.map((n) => `<label><input type="radio" name="p-count" value="${n}"${n === prefs.count ? ' checked' : ''}><span>${n}</span></label>`).join('')}
              </div>
            </div>
            <p class="muted small p-info" id="p-info" aria-live="polite"></p>
            <button type="button" class="btn btn--block" id="p-start" data-action="start-practice">Iniciar treino</button>
          </article>
        </div>

        ${renderHistory()}
      </section>`;

    const dSel = document.getElementById('p-domain');
    dSel.value = ['all', '1', '2', '3', '4'].includes(String(prefs.domain)) ? String(prefs.domain) : 'all';
    refreshTopicSelect(prefs.topic);
    updatePracticeInfo();
    window.scrollTo(0, 0);
  }

  function topicsFor(domain) {
    const counts = new Map();
    BANK.forEach((q) => {
      if (domain !== 'all' && q.domain !== Number(domain)) return;
      counts.set(q.topic, (counts.get(q.topic) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }

  function refreshTopicSelect(preferred) {
    const dSel = document.getElementById('p-domain');
    const tSel = document.getElementById('p-topic');
    const wanted = preferred !== undefined ? preferred : tSel.value;
    const topics = topicsFor(dSel.value);
    tSel.innerHTML =
      '<option value="all">Todos os tópicos</option>' +
      topics.map(([t, n]) => `<option value="${esc(t)}">${esc(t)} (${n})</option>`).join('');
    tSel.value = topics.some(([t]) => t === wanted) ? wanted : 'all';
  }

  function practiceForm() {
    const checked = document.querySelector('input[name="p-count"]:checked');
    return {
      domain: document.getElementById('p-domain').value,
      topic: document.getElementById('p-topic').value,
      count: Number(checked ? checked.value : 10),
    };
  }

  function savePracticePrefs() {
    store.set(KEYS.practice, practiceForm());
  }

  function updatePracticeInfo() {
    const f = practiceForm();
    const pool = filterPool(BANK, f.domain, f.topic);
    const seen = store.get(KEYS.seen, {});
    const fresh = pool.filter((q) => !seen[q.id]).length;
    const n = Math.min(f.count, pool.length);
    const info = document.getElementById('p-info');
    const btn = document.getElementById('p-start');
    if (!pool.length) {
      info.textContent = 'Nenhuma questão para esse filtro.';
      btn.disabled = true;
      return;
    }
    btn.disabled = false;
    let text = `${pool.length} disponíveis (${fresh} novas) · ${n} questões · tempo: ${fmtDuration(n * CONFIG.secondsPerQuestion)}`;
    if (pool.length < f.count) text += ` · o filtro só tem ${pool.length}`;
    info.textContent = text;
  }

  function renderHistory() {
    const hist = store.get(KEYS.history, []);
    if (!hist.length) {
      return `<section class="panel">
        <h2>Histórico</h2>
        <p class="muted">Nenhuma tentativa ainda. O histórico fica salvo neste navegador.</p>
      </section>`;
    }
    const rows = hist
      .map((h) => {
        const domainCells = DOMAIN_IDS.map((d) => {
          const g = h.byDomain && h.byDomain[d];
          return `<td class="num" data-label="D${d}">${g && g.t ? `${fmtPct((g.c / g.t) * 100)} <span class="muted small">${g.c}/${g.t}</span>` : '—'}</td>`;
        }).join('');
        return `<tr>
          <td data-label="Data">${fmtDate(h.date)}</td>
          <td data-label="Modo">${esc(h.label)}</td>
          <td class="num" data-label="Nota"><span class="score ${h.passed ? 'ok' : 'bad'}">${fmtPct(h.pct)}</span> <span class="muted small">${h.correct}/${h.total}</span></td>
          ${domainCells}
          <td class="num td-action">${h.detail ? `<button type="button" class="btn btn--sm btn--ghost" data-action="open-attempt" data-id="${esc(h.id)}">Ver</button>` : ''}</td>
        </tr>`;
      })
      .join('');
    return `<section class="panel">
      <div class="panel__head">
        <h2>Histórico de tentativas</h2>
        <button type="button" class="btn btn--sm btn--ghost" data-action="clear-history">Limpar histórico</button>
      </div>
      <div class="table-wrap">
        <table class="htable">
          <thead><tr><th>Data</th><th>Modo</th><th class="num">Nota</th><th class="num">D1</th><th class="num">D2</th><th class="num">D3</th><th class="num">D4</th><th class="num"><span class="sr-only">Detalhes</span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
  }

  function clearHistory() {
    const ok = window.confirm('Apagar o histórico de tentativas e a memória de questões já vistas neste navegador?');
    if (!ok) return;
    store.remove(KEYS.history);
    store.remove(KEYS.seen);
    showHome();
    toast('Histórico apagado.');
  }

  /* ---------- Criação de tentativas ---------- */

  function startExam() {
    const seen = store.get(KEYS.seen, {});
    const questions = pickExam(BANK, seen);
    beginSession(questions, { mode: 'exam', label: 'Prova completa', seconds: CONFIG.examSeconds });
  }

  function startPractice() {
    const f = practiceForm();
    savePracticePrefs();
    const seen = store.get(KEYS.seen, {});
    const questions = pickPractice(BANK, seen, f);
    if (!questions.length) {
      toast('Nenhuma questão para esse filtro.');
      return;
    }
    const scope = f.domain === 'all' ? 'todos os domínios' : `D${f.domain}`;
    const label = `Treino rápido (${scope}${f.topic === 'all' ? '' : ` · ${f.topic}`})`;
    beginSession(questions, { mode: 'practice', label, seconds: questions.length * CONFIG.secondsPerQuestion });
  }

  function retryWrong() {
    if (!view.session || !view.score) return;
    const ids = view.score.rows.filter((r) => !r.correct).map((r) => r.q.id);
    const questions = shuffle(ids.map((id) => BY_ID.get(id)).filter(Boolean));
    if (!questions.length) return;
    beginSession(questions, {
      mode: 'retry',
      label: 'Refazer erros',
      seconds: questions.length * CONFIG.secondsPerQuestion,
    });
  }

  function beginSession(questions, meta) {
    session = createSession(questions, meta);
    saveSession();
    showExam();
  }

  function saveSession() {
    if (session) store.set(KEYS.session, session);
  }

  function discardSession() {
    const ok = window.confirm('Descartar esta tentativa? Ela não será salva no histórico.');
    if (!ok) return;
    stopTimer();
    session = null;
    store.remove(KEYS.session);
    showHome();
    toast('Tentativa descartada.');
  }

  /* ---------- Prova ---------- */

  function showExam() {
    if (!session) {
      showHome();
      return;
    }
    view = { name: 'exam' };
    renderTimerSlot();
    renderExam();
    startTimer();
  }

  function go(index) {
    if (!session) return;
    const i = Math.max(0, Math.min(session.items.length - 1, index));
    if (i === session.current && view.name === 'exam') return;
    session.current = i;
    saveSession();
    view = { name: 'exam' };
    renderExam();
    window.scrollTo(0, 0);
  }

  function counts() {
    let answered = 0;
    let marked = 0;
    session.items.forEach((it) => {
      if ((session.answers[it.id] || []).length) answered += 1;
      if (session.marked[it.id]) marked += 1;
    });
    return { answered, marked };
  }

  function gridCell(i) {
    const it = session.items[i];
    const answered = (session.answers[it.id] || []).length > 0;
    const marked = !!session.marked[it.id];
    const current = i === session.current;
    const cls = ['qcell', answered ? 'is-answered' : '', marked ? 'is-marked' : '', current ? 'is-current' : '']
      .filter(Boolean)
      .join(' ');
    const label = `Questão ${i + 1}, ${answered ? 'respondida' : 'sem resposta'}${marked ? ', marcada para revisão' : ''}`;
    return `<button type="button" class="${cls}" data-action="goto" data-index="${i}" aria-label="${label}"${current ? ' aria-current="true"' : ''}>${i + 1}</button>`;
  }

  function renderExam() {
    const s = session;
    const idx = s.current;
    const item = s.items[idx];
    const q = BY_ID.get(item.id);
    const total = s.items.length;
    const ans = s.answers[item.id] || [];
    const multi = q.type === 'multiple';
    const limit = q.correct.length;
    const marked = !!s.marked[item.id];
    const c = counts();
    const wide = window.matchMedia('(min-width: 960px)').matches;

    const options = item.order
      .map((key, i) => {
        const o = optionOf(q, key);
        const checked = ans.includes(key);
        const disabled = multi && !checked && ans.length >= limit;
        return `<label class="option${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}">
          <input type="${multi ? 'checkbox' : 'radio'}" name="opt" value="${esc(key)}" data-opt${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
          <span class="option__letter" aria-hidden="true">${LETTERS[i]}.</span>
          <span class="option__text">${esc(o.text)}</span>
        </label>`;
      })
      .join('');

    const isLast = idx === total - 1;
    $app.innerHTML = `
      <section class="exam">
        <div class="exam__main">
          <div class="qhead">
            <span class="qhead__count">Questão <strong>${idx + 1}</strong> de ${total}</span>
            <button type="button" class="btn btn--sm mark-btn${marked ? ' is-on' : ''}" data-action="toggle-mark" aria-pressed="${marked}">
              ${ICONS.flag}<span class="mark-btn__label">${marked ? 'Marcada para revisão' : 'Marcar para revisão'}</span>
            </button>
          </div>
          <div class="progress" aria-hidden="true"><span style="width:${((idx + 1) / total) * 100}%"></span></div>
          <p class="qtext" id="qtext">${esc(q.question)}</p>
          ${multi ? `<p class="qhint" id="qhint">Seleção múltipla: escolha ${limit} opções · <strong id="qhint-count">${ans.length}</strong>/${limit} selecionadas</p>` : ''}
          <div class="options" role="${multi ? 'group' : 'radiogroup'}" aria-labelledby="qtext"${multi ? ' aria-describedby="qhint"' : ''}>
            ${options}
          </div>
          <nav class="qnav" aria-label="Navegação entre questões">
            <button type="button" class="btn" data-action="prev"${idx === 0 ? ' disabled' : ''}>${ICONS.left}<span>Anterior</span></button>
            ${isLast
              ? '<button type="button" class="btn btn--primary" data-action="review">Revisar e enviar</button>'
              : `<button type="button" class="btn btn--primary" data-action="next"><span>Próxima</span>${ICONS.right}</button>`}
          </nav>
          <p class="shortcuts">Atalhos: <kbd>A</kbd>–<kbd>${LETTERS[item.order.length - 1]}</kbd> responder · <kbd>←</kbd> <kbd>→</kbd> navegar · <kbd>M</kbd> marcar para revisão</p>
        </div>

        <aside class="exam__side" aria-label="Mapa da prova">
          <div class="side-card">
            <div class="side-stats">
              <span><strong id="answered-count">${c.answered}</strong>/${total} respondidas</span>
              <span><strong id="marked-count">${c.marked}</strong> marcadas</span>
            </div>
            <details class="qgrid-wrap"${wide ? ' open' : ''}>
              <summary>Mapa de questões</summary>
              <div class="qgrid">${s.items.map((_, i) => gridCell(i)).join('')}</div>
              <ul class="legend">
                <li><span class="swatch swatch--answered"></span>Respondida</li>
                <li><span class="swatch"></span>Sem resposta</li>
                <li><span class="swatch swatch--marked"></span>Marcada</li>
                <li><span class="swatch swatch--current"></span>Atual</li>
              </ul>
            </details>
            <button type="button" class="btn btn--primary btn--block" data-action="review">Revisar e enviar</button>
          </div>
        </aside>
      </section>`;
  }

  function onAnswerChange(input) {
    if (!session) return;
    const item = session.items[session.current];
    const q = BY_ID.get(item.id);
    if (q.type === 'single') {
      session.answers[item.id] = [input.value];
    } else {
      const limit = q.correct.length;
      const checked = Array.from($app.querySelectorAll('input[data-opt]:checked')).map((x) => x.value);
      if (checked.length > limit) {
        input.checked = false;
        toast(`Esta questão pede ${limit} opções. Desmarque uma para trocar.`);
        return;
      }
      if (checked.length) session.answers[item.id] = checked;
      else delete session.answers[item.id];
    }
    saveSession();
    refreshQuestionState();
  }

  // Atualiza só o que muda ao responder (mantém o foco do teclado).
  function refreshQuestionState() {
    const item = session.items[session.current];
    const q = BY_ID.get(item.id);
    const ans = session.answers[item.id] || [];
    const multi = q.type === 'multiple';
    const limit = q.correct.length;
    $app.querySelectorAll('input[data-opt]').forEach((input) => {
      const checked = ans.includes(input.value);
      const disabled = multi && !checked && ans.length >= limit;
      input.checked = checked;
      input.disabled = disabled;
      const label = input.closest('.option');
      label.classList.toggle('is-selected', checked);
      label.classList.toggle('is-disabled', disabled);
    });
    const hint = document.getElementById('qhint-count');
    if (hint) hint.textContent = String(ans.length);
    refreshSide();
  }

  function refreshSide() {
    const c = counts();
    const a = document.getElementById('answered-count');
    const m = document.getElementById('marked-count');
    if (a) a.textContent = String(c.answered);
    if (m) m.textContent = String(c.marked);
    const cell = $app.querySelector(`.qcell[data-index="${session.current}"]`);
    if (cell) cell.outerHTML = gridCell(session.current);
  }

  function toggleMark() {
    if (!session) return;
    const id = session.items[session.current].id;
    if (session.marked[id]) delete session.marked[id];
    else session.marked[id] = true;
    saveSession();
    const on = !!session.marked[id];
    const btn = $app.querySelector('.mark-btn');
    if (btn) {
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.querySelector('.mark-btn__label').textContent = on ? 'Marcada para revisão' : 'Marcar para revisão';
    }
    refreshSide();
  }

  /* ---------- Cronômetro ---------- */

  function renderTimerSlot() {
    if (document.getElementById('timer')) return;
    document.getElementById('timer-slot').innerHTML = `
      <div class="timer" id="timer-box" role="timer" aria-label="Tempo restante">
        ${ICONS.clock}<span id="timer">--:--</span>
      </div>`;
  }

  function clearTimerSlot() {
    document.getElementById('timer-slot').innerHTML = '';
  }

  function warnThreshold(s) {
    return s.durationSec > CONFIG.warnSeconds ? CONFIG.warnSeconds : Math.floor(s.durationSec / 4);
  }

  function startTimer() {
    stopTimer();
    tick();
    timerId = window.setInterval(tick, 500);
  }

  function stopTimer() {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  }

  function tick() {
    if (!session) {
      stopTimer();
      return;
    }
    const left = Math.max(0, Math.ceil((session.endsAt - Date.now()) / 1000));
    const warnAt = warnThreshold(session);
    const el = document.getElementById('timer');
    if (el) {
      el.textContent = fmtClock(left);
      document.getElementById('timer-box').classList.toggle('is-warning', left <= warnAt);
    }
    if (left <= 0) {
      finishSession('timeout');
      return;
    }
    if (left <= warnAt && !session.warned) {
      session.warned = true;
      saveSession();
      const mins = Math.round(warnAt / 60);
      toast(warnAt >= 60 ? `Atenção: faltam ${mins} minutos!` : 'Atenção: o tempo está acabando!', 'warn');
    }
  }

  /* ---------- Revisão antes do envio ---------- */

  function showReview() {
    if (!session) return;
    view = { name: 'review' };
    const s = session;
    const unanswered = [];
    const marked = [];
    s.items.forEach((it, i) => {
      if (!(s.answers[it.id] || []).length) unanswered.push(i);
      if (s.marked[it.id]) marked.push(i);
    });
    const total = s.items.length;
    const list = (arr, empty) =>
      arr.length
        ? `<ul class="review-list">${arr
            .map((i) => {
              const q = BY_ID.get(s.items[i].id);
              return `<li><button type="button" class="review-item" data-action="goto" data-index="${i}">
                <span class="review-item__n">${i + 1}</span>
                <span class="review-item__text">${esc(truncate(q.question, 160))}</span>
              </button></li>`;
            })
            .join('')}</ul>`
        : `<p class="muted">${empty}</p>`;

    $app.innerHTML = `
      <section class="review">
        <h1>Revisão antes de enviar</h1>
        <p class="muted">Clique em uma questão para voltar a ela. O cronômetro continua correndo.</p>
        <div class="review-stats">
          ${statTile('Respondidas', `${total - unanswered.length}/${total}`, '')}
          ${statTile('Sem resposta', unanswered.length, unanswered.length ? 'contam como erro' : 'nenhuma')}
          ${statTile('Marcadas', marked.length, 'para revisão')}
        </div>
        <section class="panel">
          <h2>Sem resposta (${unanswered.length})</h2>
          ${list(unanswered, 'Todas as questões foram respondidas.')}
        </section>
        <section class="panel">
          <h2>Marcadas para revisão (${marked.length})</h2>
          ${list(marked, 'Nenhuma questão marcada.')}
        </section>
        <div class="actions">
          <button type="button" class="btn" data-action="back-to-exam">${ICONS.left}<span>Voltar para a prova</span></button>
          <button type="button" class="btn btn--primary" data-action="submit">Enviar prova</button>
        </div>
        <p class="review-foot"><button type="button" class="linklike" data-action="discard">Descartar esta tentativa</button></p>
      </section>`;
    window.scrollTo(0, 0);
  }

  function statTile(label, value, note) {
    return `<div class="stat">
      <span class="stat__label">${esc(label)}</span>
      <span class="stat__value">${esc(value)}</span>
      ${note ? `<span class="stat__note">${esc(note)}</span>` : ''}
    </div>`;
  }

  /* ---------- Envio e resultado ---------- */

  function finishSession(reason) {
    if (!session || session.submittedAt) return;
    stopTimer();
    const s = session;
    s.submittedAt = Math.min(Date.now(), s.endsAt);
    s.reason = reason;
    const sc = scoreSession(s, BY_ID);

    const seen = store.get(KEYS.seen, {});
    s.items.forEach((it) => {
      seen[it.id] = s.submittedAt;
    });
    store.set(KEYS.seen, seen);

    const hist = store.get(KEYS.history, []);
    hist.unshift(makeHistoryEntry(s, sc));
    saveHistory(hist);

    store.remove(KEYS.session);
    session = null;
    clearTimerSlot();
    showResult(s, { fresh: true });
  }

  function makeHistoryEntry(s, sc) {
    const byDomain = {};
    sc.byDomain.forEach((g) => {
      byDomain[g.key] = { c: g.correct, t: g.total };
    });
    return {
      id: String(s.startedAt),
      date: s.submittedAt,
      mode: s.mode,
      label: s.label,
      total: sc.total,
      correct: sc.correct,
      pct: Math.round(sc.pct * 10) / 10,
      passed: sc.passed,
      usedSec: sc.usedSec,
      byDomain,
      detail: {
        mode: s.mode,
        label: s.label,
        startedAt: s.startedAt,
        endsAt: s.endsAt,
        durationSec: s.durationSec,
        submittedAt: s.submittedAt,
        reason: s.reason,
        items: s.items,
        answers: s.answers,
        marked: s.marked,
      },
    };
  }

  function saveHistory(hist) {
    let list = hist.slice(0, CONFIG.historyMax);
    list.forEach((h, i) => {
      if (i >= CONFIG.historyDetailMax) delete h.detail;
    });
    // Se o armazenamento encher, reduz os detalhes guardados até caber.
    let keep = CONFIG.historyDetailMax;
    while (!store.set(KEYS.history, list) && keep > 0) {
      keep = Math.floor(keep / 2);
      list = list.map((h, i) => {
        if (i >= keep) {
          const copy = Object.assign({}, h);
          delete copy.detail;
          return copy;
        }
        return h;
      });
    }
  }

  function openAttempt(id) {
    const h = store.get(KEYS.history, []).find((x) => x.id === id);
    if (!h || !h.detail) {
      toast('Os detalhes desta tentativa não estão mais disponíveis.');
      return;
    }
    if (!h.detail.items.some((it) => BY_ID.has(it.id))) {
      toast('As questões desta tentativa não existem mais no banco.');
      return;
    }
    showResult(Object.assign({}, h.detail), { fresh: false });
  }

  function showResult(s, opts) {
    const sc = scoreSession(s, BY_ID);
    view = { name: 'result', session: s, score: sc };
    const wrongRows = sc.rows.filter((r) => !r.correct);
    const timeout = opts && opts.fresh && s.reason === 'timeout';

    $app.innerHTML = `
      <section class="result">
        ${timeout ? '<div class="banner banner--warn" role="alert">O tempo acabou e a tentativa foi enviada automaticamente.</div>' : ''}
        <div class="result-hero ${sc.passed ? 'is-pass' : 'is-fail'}">
          <div class="result-hero__score">
            <span class="big">${fmtPct(sc.pct)}</span>
            <span class="muted small">meta: ${CONFIG.passPct}%</span>
          </div>
          <div class="result-hero__info">
            <span class="badge ${sc.passed ? 'badge--ok' : 'badge--bad'}">${sc.passed ? 'Aprovado' : 'Reprovado'}</span>
            <h1>${esc(s.label)}</h1>
            <p class="muted">${fmtDate(s.submittedAt)} · ${sc.total} questões</p>
          </div>
        </div>

        <div class="stat-grid">
          ${statTile('Acertos', sc.correct, `de ${sc.total} questões`)}
          ${statTile('Erros', sc.wrong, sc.unanswered ? `inclui ${sc.unanswered} sem resposta` : 'todas respondidas')}
          ${statTile('Tempo usado', fmtDuration(sc.usedSec), `de ${fmtDuration(s.durationSec)}`)}
          ${statTile('Média por questão', fmtDuration(sc.avgSec), 'ritmo da prova: 1min23')}
        </div>

        <div class="two-col">
          <section class="panel">
            <h2>Desempenho por domínio</h2>
            <p class="muted small">Do pior para o melhor</p>
            ${bars(sc.byDomain)}
          </section>
          <section class="panel">
            <h2>Desempenho por tópico</h2>
            <p class="muted small">Do pior para o melhor</p>
            ${bars(sc.byTopic)}
          </section>
        </div>

        <section class="panel">
          <div class="panel__head">
            <h2>Questões erradas (${wrongRows.length})</h2>
            ${wrongRows.length ? `<button type="button" class="btn btn--sm" data-action="copy-md">${ICONS.copy}<span>Copiar erros em Markdown</span></button>` : ''}
          </div>
          ${wrongRows.length ? wrongRows.map(renderWrongCard).join('') : '<p class="muted">Nenhum erro nesta tentativa.</p>'}
        </section>

        <div class="actions">
          ${wrongRows.length ? '<button type="button" class="btn" data-action="retry-wrong">Refazer só os erros</button>' : ''}
          <button type="button" class="btn btn--primary" data-action="home">Voltar ao início</button>
        </div>
      </section>`;
    window.scrollTo(0, 0);
  }

  function bars(groups) {
    return `<ul class="bars">${groups
      .map((g) => {
        const tone = g.pct >= CONFIG.passPct ? 'ok' : g.pct >= 70 ? 'mid' : 'bad';
        return `<li class="bar bar--${tone}">
          <div class="bar__top">
            <span class="bar__label">${esc(g.label)}</span>
            <span class="bar__value">${fmtPct(g.pct)} <span class="muted small">(${g.correct}/${g.total})</span></span>
          </div>
          <div class="bar__track"><span class="bar__fill" style="width:${Math.max(g.pct, 1.5)}%"></span></div>
        </li>`;
      })
      .join('')}</ul>`;
  }

  function renderWrongCard(r) {
    const q = r.q;
    const opts = r.item.order
      .map((key, i) => {
        const o = optionOf(q, key);
        const isRight = q.correct.includes(key);
        const picked = r.ans.includes(key);
        const cls = isRight ? ' is-correct' : picked ? ' is-wrong' : '';
        let tag = '';
        if (isRight && picked) tag = 'Correta · sua escolha';
        else if (isRight) tag = 'Correta';
        else if (picked) tag = 'Sua escolha';
        return `<li class="ropt${cls}">
          <div class="ropt__head">
            <span class="option__letter">${LETTERS[i]}.</span>
            <span class="ropt__text">${esc(o.text)}</span>
            ${tag ? `<span class="ropt__tag">${tag}</span>` : ''}
          </div>
          <p class="ropt__why">${esc(stripVerdict(o.explanation))}</p>
        </li>`;
      })
      .join('');
    const fmtKeys = (keys) => keys.map((k) => `${letterOf(r.item, k)}) ${optionOf(q, k).text}`).join(' | ');
    const yours = r.answered ? fmtKeys(r.ans.slice().sort((a, b) => r.item.order.indexOf(a) - r.item.order.indexOf(b))) : 'Sem resposta';
    const right = fmtKeys(q.correct.slice().sort((a, b) => r.item.order.indexOf(a) - r.item.order.indexOf(b)));
    return `<article class="wrong">
      <header class="wrong__head">
        <span class="wrong__n">Questão ${r.n}</span>
        <span class="chip">D${q.domain} · ${esc(q.topic)}</span>
        ${q.type === 'multiple' ? '<span class="chip">Seleção múltipla</span>' : ''}
      </header>
      <p class="wrong__q">${esc(q.question)}</p>
      <dl class="wrong__answers">
        <div><dt>Sua resposta</dt><dd class="bad">${esc(yours)}</dd></div>
        <div><dt>Resposta correta</dt><dd class="ok">${esc(right)}</dd></div>
      </dl>
      <ol class="ropts">${opts}</ol>
      <div class="trigger"><strong>Como reconhecer na prova:</strong> ${esc(q.trigger)}</div>
      <p class="ref"><strong>Referência:</strong> ${linkify(q.reference)}</p>
    </article>`;
  }

  /* ---------- Copiar / baixar Markdown ---------- */

  async function copyMarkdown() {
    if (!view.session || !view.score) return;
    const md = buildMarkdown(view.session, view.score);
    const ok = await copyText(md);
    if (ok) toast('Erros copiados em Markdown.');
    else showTextDialog('Copiar erros em Markdown', md);
  }

  function downloadMarkdown() {
    if (!view.session || !view.score) return;
    const md = buildMarkdown(view.session, view.score);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date(view.session.submittedAt || Date.now());
    a.href = url;
    a.download = `erros-clf-c02-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      /* tenta o método alternativo */
    }
    // Acesso pela rede local (http://IP) não é "contexto seguro": usa execCommand.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  function showTextDialog(title, text) {
    const dlg = document.getElementById('dlg');
    dlg.innerHTML = `<div class="dialog__inner">
      <h2 id="dlg-title">${esc(title)}</h2>
      <p class="muted small">A cópia automática não funcionou neste endereço. Selecione o texto e copie manualmente, ou baixe o arquivo .md.</p>
      <textarea class="dialog__text" readonly>${esc(text)}</textarea>
      <div class="actions">
        <button type="button" class="btn" data-action="download-md">Baixar .md</button>
        <button type="button" class="btn btn--primary" data-action="close-dialog">Fechar</button>
      </div>
    </div>`;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    const ta = dlg.querySelector('textarea');
    ta.focus();
    ta.select();
  }

  function closeDialog() {
    const dlg = document.getElementById('dlg');
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  /* ---------- Avisos ---------- */

  function toast(message, kind) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast is-visible${kind ? ` toast--${kind}` : ''}`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      el.className = 'toast';
    }, kind === 'warn' ? 6000 : 3200);
  }

  init();
})();
