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
  // No GitHub Pages, o localStorage de <usuario>.github.io é compartilhado por todos os repositórios:
  // as chaves levam o nome do projeto.
  const PREFIX = 'simulado_aws_practitioner.';
  const KEYS = {
    session: `${PREFIX}session`,
    history: `${PREFIX}history`,
    seen: `${PREFIX}seen`,
    theme: `${PREFIX}theme`,
    practice: `${PREFIX}practice`,
    review: `${PREFIX}review`, // último simulado: 1ª tentativa + refazeres
    answersUi: `${PREFIX}answers.ui`, // filtro e questão abertos em "Respostas completas"
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

  const PENDING_TEXT = 'Justificativa pendente';

  // Justificativa da alternativa, sem o "Correta."/"Incorreta." do início. Se faltar, avisa em vez de quebrar.
  function justification(option) {
    const t = stripVerdict(option && option.explanation).trim();
    return t || PENDING_TEXT;
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
      reviewId: meta.reviewId || null, // refazer: id da revisão (1ª tentativa) de onde os erros saíram
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
          .map((k) => `Marquei "${optionOf(q, k).text}": ${justification(optionOf(q, k))}`)
          .join(' ');
      } else {
        const picked = r.ans.map((k) => `"${optionOf(q, k).text}"`).join(' e ');
        confused = `Marquei só ${picked} e não escolhi a outra opção correta.`;
      }
      const right = q.correct
        .map((k) => `"${optionOf(q, k).text}": ${justification(optionOf(q, k))}`)
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

  /* ---------- Conclusão: 1ª tentativa × refazeres ---------- */

  // Cópia independente do que foi respondido (a sessão pode mudar depois).
  function attemptOf(s) {
    return JSON.parse(
      JSON.stringify({
        startedAt: s.startedAt,
        endsAt: s.endsAt,
        durationSec: s.durationSec,
        submittedAt: s.submittedAt,
        reason: s.reason,
        items: s.items,
        answers: s.answers,
      })
    );
  }

  // A tentativa original e os refazeres ficam separados: refazer nunca altera a 1ª tentativa.
  function createReview(s) {
    return { v: 2, id: String(s.startedAt), label: s.label, mode: s.mode, first: attemptOf(s), retries: [] };
  }

  // Acrescenta um refazer à revisão de onde ele saiu; devolve null se a sessão não for desse refazer.
  function addRetry(review, s) {
    if (!review || !s || s.mode !== 'retry' || !s.reviewId || s.reviewId !== review.id) return null;
    const next = JSON.parse(JSON.stringify(review));
    next.retries = (next.retries || []).concat([attemptOf(s)]);
    return next;
  }

  // Uma linha por questão da 1ª tentativa, com a resposta mais recente do refazer (se houve).
  // ok = certa de primeira · fixed = errada e corrigida no refazer · wrong = errada (em branco é erro).
  function reviewRows(review, byId) {
    const last = {};
    (review.retries || []).forEach((r) => r.items.forEach((it) => (last[it.id] = r.answers[it.id] || [])));
    const rows = [];
    review.first.items.forEach((item, idx) => {
      const q = byId.get(item.id);
      if (!q) return;
      const first = (review.first.answers[item.id] || []).slice();
      const okFirst = sameAnswer(q.correct, first);
      const again = !okFirst && item.id in last ? last[item.id].slice() : null;
      let status = 'ok';
      if (!okFirst) status = again && sameAnswer(q.correct, again) ? 'fixed' : 'wrong';
      rows.push({ n: idx + 1, q, item, first, last: again, status });
    });
    return rows;
  }

  // Questões que continuam erradas: são as que o próximo refazer oferece.
  function pendingIds(review, byId) {
    return reviewRows(review, byId).filter((r) => r.status === 'wrong').map((r) => r.q.id);
  }

  // Botões da conclusão: "Refazer as X erradas" só com X > 0; "Ver respostas completas" sempre.
  function conclusionActions(review, byId) {
    return { retry: pendingIds(review, byId).length, answers: true };
  }

  function reviewSummary(rows) {
    const count = (st) => rows.filter((r) => r.status === st).length;
    const total = rows.length;
    const ok = count('ok');
    const fixed = count('fixed');
    return {
      total,
      ok,
      fixed,
      wrong: count('wrong'),
      firstPct: total ? (ok * 100) / total : 0,
      nowPct: total ? ((ok + fixed) * 100) / total : 0,
      retried: rows.some((r) => r.last !== null),
    };
  }

  const REVIEW_FILTERS = {
    all: () => true,
    wrong: (r) => r.status !== 'ok', // errou na 1ª tentativa (inclui as corrigidas no refazer)
    right: (r) => r.status === 'ok', // acertou de primeira
  };

  // domain: 'all' ou o número do domínio (o <select> entrega como texto).
  function filterReviewRows(rows, filter, domain) {
    const byStatus = REVIEW_FILTERS[filter] || REVIEW_FILTERS.all;
    const allDomains = domain == null || domain === 'all';
    return rows.filter((r) => byStatus(r) && (allDomains || r.q.domain === Number(domain)));
  }

  // Destaca no enunciado os trechos que o trigger cita entre aspas simples (antes do "→").
  // Só trechos com 3+ caracteres, começando no início de uma palavra e indo até o fim dela.
  // Um trecho com barra ('dedicada/privada') que não aparece inteiro é procurado por partes.
  function markKeywords(text, trigger) {
    const src = String(text || '');
    const cue = String(trigger || '').split('→')[0];
    const lower = src.toLowerCase();
    const isWord = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);
    const occurs = (p) => {
      const needle = p.toLowerCase();
      for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + needle.length)) {
        if (!isWord(src[at - 1])) return true;
      }
      return false;
    };
    const phrases = (cue.match(/'([^']+)'/g) || [])
      .map((p) => p.slice(1, -1).trim())
      .filter((p) => p.length >= 3)
      .flatMap((p) => (occurs(p) ? [p] : p.split('/').map((s) => s.trim()).filter((s) => s.length >= 4)));
    const ranges = [];
    phrases.forEach((p) => {
      const needle = p.toLowerCase();
      let at = lower.indexOf(needle);
      while (at >= 0) {
        if (!isWord(src[at - 1])) {
          let end = at + needle.length;
          while (isWord(src[end])) end += 1;
          ranges.push([at, end]);
        }
        at = lower.indexOf(needle, at + needle.length);
      }
    });
    if (!ranges.length) return esc(src);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((r) => {
      const prev = merged[merged.length - 1];
      if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1]);
      else merged.push(r.slice());
    });
    let out = '';
    let pos = 0;
    merged.forEach(([a, b]) => {
      out += `${esc(src.slice(pos, a))}<mark class="kw">${esc(src.slice(a, b))}</mark>`;
      pos = b;
    });
    return out + esc(src.slice(pos));
  }

  // Baixa um JSON tentando de novo quando a conexão falha (redes móveis e CDN às vezes derrubam o pedido).
  // Cada tentativa tem limite de tempo; depois de `tries` falhas, desiste com o arquivo e o motivo.
  async function fetchJsonWithRetry(url, opts) {
    const o = Object.assign({ tries: 3, timeoutMs: 15000, wait: (ms) => new Promise((r) => setTimeout(r, ms)) }, opts || {});
    const doFetch = o.fetch || ((u, init) => globalThis.fetch(u, init));
    let lastErr = null;
    for (let i = 0; i < o.tries; i++) {
      if (i) await o.wait(700 * i);
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), o.timeoutMs) : null;
      try {
        const res = await doFetch(url, { cache: i ? 'reload' : 'no-cache', signal: ctrl ? ctrl.signal : undefined });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    const why = lastErr && lastErr.name === 'AbortError' ? 'tempo esgotado' : lastErr && lastErr.message ? lastErr.message : String(lastErr);
    throw new Error(`Não foi possível carregar ${url} (${why}).`);
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
    justification,
    KEYS,
    attemptOf,
    createReview,
    addRetry,
    reviewRows,
    pendingIds,
    conclusionActions,
    reviewSummary,
    filterReviewRows,
    markKeywords,
    fetchJsonWithRetry,
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
  let reviewMem = null; // cópia em memória, se o localStorage falhar

  function isReview(rv) {
    return !!rv && rv.v === 2 && !!rv.first && Array.isArray(rv.first.items) && Array.isArray(rv.retries);
  }

  function loadReview() {
    const rv = store.get(KEYS.review, null);
    return isReview(rv) ? rv : reviewMem;
  }

  function saveReview(rv) {
    reviewMem = rv;
    store.set(KEYS.review, rv);
  }

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
    // Recarregou na conclusão ou nas respostas completas: volta para a mesma tela.
    const m = window.location.hash.match(/^#(resumo|respostas)\/(.+)$/);
    const rv = m && reviewFor(decodeURIComponent(m[2]));
    if (rv) {
      if (m[1] === 'respostas') showAnswers(rv);
      else showConclusion(rv);
      return;
    }
    showHome();
  }

  // Só a conclusão (#resumo/<id>) e as respostas (#respostas/<id>) têm endereço; as outras telas limpam o hash.
  function setRoute(hash) {
    const want = hash ? `#${hash}` : '';
    if (window.location.hash === want) return;
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${want}`);
    } catch (e) {
      /* ignora */
    }
  }

  async function loadBank() {
    const lists = await Promise.all(
      CONFIG.files.map(async (file) => {
        const data = await fetchJsonWithRetry(file);
        if (!Array.isArray(data)) throw new Error(`${file} não contém uma lista de questões.`);
        return data;
      })
    );
    return lists.flat();
  }

  // Quem visita o site vê só "verifique a conexão" + "Tentar de novo"; a dica do servidor local
  // aparece apenas para quem abriu o arquivo direto do disco (file://).
  function renderLoadError(err) {
    const isFile = window.location.protocol === 'file:';
    const detail = esc(err && err.message ? err.message : String(err));
    $app.innerHTML = isFile
      ? `<div class="banner banner--error">
          <h1>Não foi possível carregar as questões</h1>
          <p>Você abriu o arquivo direto do disco (file://), e o navegador bloqueia a leitura dos JSON nesse modo.</p>
          <p>Inicie um servidor local na pasta do projeto e abra o endereço que ele mostrar: <kbd>npx serve .</kbd> ou <kbd>python -m http.server 3000</kbd></p>
          <p class="muted small">${detail}</p>
        </div>`
      : `<div class="banner banner--error">
          <h1>Não foi possível carregar as questões</h1>
          <p>Verifique sua conexão com a internet e tente de novo.</p>
          <p><button type="button" class="btn btn--primary" data-action="reload">Tentar de novo</button></p>
          <p class="muted small">Detalhe: ${detail}</p>
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
      case 'retry': startRetry(); break;
      case 'open-conclusion': openReview(el.dataset.id, 'conclusion'); break;
      case 'open-answers': openReview(el.dataset.id, 'answers'); break;
      case 'ans-filter': setAnswersFilter(el.dataset.value); break;
      case 'ans-goto': answersGoto(el.dataset.qid); break;
      case 'ans-prev': answersStep(-1); break;
      case 'ans-next': answersStep(1); break;
      case 'open-attempt': openReview(el.dataset.id, 'conclusion'); break;
      case 'clear-history': clearHistory(); break;
      case 'close-dialog': closeDialog(); break;
      case 'reload': window.location.reload(); break;
      default: break;
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.matches('input[data-opt]')) {
      onAnswerChange(t);
      return;
    }
    if (t.id === 'ans-domain') {
      setAnswersDomain(t.value);
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
    if (view.name === 'answers') {
      onAnswersKey(e);
      return;
    }
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
    setRoute('');
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
          <ul class="intro">
            <li><strong>O que é:</strong> simulado da CLF-C02 com ${BANK.length} questões originais, separadas pelos domínios da prova.</li>
            <li><strong>Como funciona:</strong> responda → refaça as que errou → veja as respostas completas, com o porquê de cada alternativa estar certa ou errada.</li>
            <li><strong>Privacidade:</strong> sem cadastro; o progresso fica salvo só no seu navegador.</li>
          </ul>
          <p class="intro__note">Projeto independente, não afiliado à AWS.</p>
          <ul class="bank" aria-label="Questões por domínio">
            ${DOMAIN_IDS.map((d) => `<li title="${esc(CONFIG.domains[d].name)}">D${d} <strong>${countByDomain(d)}</strong></li>`).join('')}
            <li><strong>${unseen}</strong> ainda não vistas</li>
          </ul>
        </div>

        ${renderLastReview()}

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
    const ok = window.confirm('Apagar o histórico de tentativas, a memória de questões já vistas e o último simulado guardado para revisão neste navegador?');
    if (!ok) return;
    store.remove(KEYS.history);
    store.remove(KEYS.seen);
    store.remove(KEYS.review);
    store.remove(KEYS.answersUi);
    reviewMem = null;
    showHome();
    toast('Histórico apagado.');
  }

  // Tela inicial: atalho para o último simulado.
  function renderLastReview() {
    const rv = loadReview();
    if (!rv) return '';
    const rows = reviewRows(rv, BY_ID);
    if (!rows.length) return '';
    const sum = reviewSummary(rows);
    const score = sum.retried
      ? `Nota atualizada <strong>${fmtPct(sum.nowPct)}</strong> · 1ª tentativa ${fmtPct(sum.firstPct)}`
      : `Nota <strong>${fmtPct(sum.firstPct)}</strong>`;
    const pending = sum.wrong ? ` · ${sum.wrong} ${sum.wrong === 1 ? 'errada' : 'erradas'} para refazer` : '';
    return `<section class="panel last-review">
      <div class="panel__head">
        <h2>Último simulado</h2>
        <span class="muted small">${esc(rv.label)} · ${fmtDate(rv.first.submittedAt)}</span>
      </div>
      <p>${score}${pending}</p>
      <div class="actions actions--start">
        <button type="button" class="btn btn--primary" data-action="open-conclusion" data-id="${esc(rv.id)}">Abrir resumo</button>
        <button type="button" class="btn" data-action="open-answers" data-id="${esc(rv.id)}">Ver respostas completas</button>
      </div>
    </section>`;
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

  // Refaz as questões que continuam erradas. As respostas ficam separadas das da 1ª tentativa.
  function startRetry() {
    const rv = view.review;
    if (!rv) return;
    const questions = shuffle(pendingIds(rv, BY_ID).map((id) => BY_ID.get(id)));
    if (!questions.length) {
      showConclusion(rv);
      return;
    }
    // Uma tentativa aberta pelo histórico passa a ser o "último simulado", para o refazer voltar a ela.
    const stored = loadReview();
    if (!stored || stored.id !== rv.id) saveReview(rv);
    beginSession(questions, {
      mode: 'retry',
      label: 'Refazer erradas',
      seconds: questions.length * CONFIG.secondsPerQuestion,
      reviewId: rv.id,
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
    setRoute('');
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

  /* ---------- Envio ---------- */

  function finishSession(reason) {
    if (!session || session.submittedAt) return;
    stopTimer();
    const s = session;
    s.submittedAt = Math.min(Date.now(), s.endsAt);
    s.reason = reason;

    const seen = store.get(KEYS.seen, {});
    s.items.forEach((it) => {
      seen[it.id] = s.submittedAt;
    });
    store.set(KEYS.seen, seen);

    store.remove(KEYS.session);
    session = null;
    clearTimerSlot();
    const opts = { timeoutMsg: reason === 'timeout' ? 'O tempo acabou e as respostas foram enviadas automaticamente.' : '' };

    // Refazer: entra na revisão de onde saiu (a 1ª tentativa não muda) e volta à conclusão com a nota atualizada.
    const updated = addRetry(loadReview(), s);
    if (updated) {
      saveReview(updated);
      showConclusion(updated, opts);
      return;
    }
    // Tentativa nova: entra no histórico e vira o "último simulado".
    const hist = store.get(KEYS.history, []);
    hist.unshift(makeHistoryEntry(s, scoreSession(s, BY_ID)));
    saveHistory(hist);
    const rv = createReview(s);
    saveReview(rv);
    showConclusion(rv, opts);
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

  // A revisão de um id: o último simulado (com os refazeres) ou uma tentativa do histórico.
  function reviewFor(id) {
    const stored = loadReview();
    if (stored && stored.id === id) return stored;
    const h = store.get(KEYS.history, []).find((x) => x.id === id);
    if (!h || !h.detail || !h.detail.items.some((it) => BY_ID.has(it.id))) return null;
    const d = h.detail;
    return {
      v: 2,
      id: h.id,
      label: d.label || h.label,
      mode: d.mode || h.mode,
      first: {
        startedAt: d.startedAt,
        endsAt: d.endsAt,
        durationSec: d.durationSec,
        submittedAt: d.submittedAt,
        reason: d.reason,
        items: d.items,
        answers: d.answers || {},
      },
      retries: [],
    };
  }

  // Sem id: a revisão da tela atual (conclusão ↔ respostas).
  function openReview(id, screen) {
    const rv = id ? reviewFor(id) : view.review;
    if (!rv) {
      toast('Os detalhes desta tentativa não estão mais disponíveis.');
      return;
    }
    if (screen === 'answers') showAnswers(rv);
    else showConclusion(rv);
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

  function whyHtml(o) {
    const t = justification(o);
    return `<p class="ropt__why${t === PENDING_TEXT ? ' is-pending' : ''}">${esc(t)}</p>`;
  }

  /* ---------- Conclusão ---------- */

  const tone = (pct) => (pct >= CONFIG.passPct ? 'ok' : pct >= 70 ? 'mid' : 'bad');

  // A 1ª tentativa no formato de sessão: reaproveita placar, barras e o Markdown dos erros.
  function firstAsSession(rv) {
    return Object.assign({ mode: rv.mode, label: rv.label, marked: {} }, rv.first);
  }

  function showConclusion(rv, opts) {
    stopTimer();
    clearTimerSlot();
    setRoute(`resumo/${encodeURIComponent(rv.id)}`);
    const rows = reviewRows(rv, BY_ID);
    const sum = reviewSummary(rows);
    const act = conclusionActions(rv, BY_ID);
    const first = firstAsSession(rv);
    const sc = scoreSession(first, BY_ID);
    view = { name: 'conclusion', review: rv, session: first, score: sc };
    const passed = sum.firstPct >= CONFIG.passPct;
    const pct = sum.retried ? sum.nowPct : sum.firstPct;
    const blanks = rows.filter((r) => !r.first.length).length;
    const msg = opts && opts.timeoutMsg;
    const retryLabel = act.retry === 1 ? 'Refazer a errada' : `Refazer as ${act.retry} erradas`;
    const scoreNote = sum.retried
      ? `${sum.ok + sum.fixed}/${sum.total} · 1ª tentativa ${fmtPct(sum.firstPct)}`
      : `${sum.ok}/${sum.total} · meta ${CONFIG.passPct}%`;

    $app.innerHTML = `
      <section class="result conclusion">
        ${msg ? `<div class="banner banner--warn" role="alert">${esc(msg)}</div>` : ''}
        <div class="result-hero ${passed ? 'is-pass' : 'is-fail'}">
          <div class="result-hero__score">
            <span class="score-pair__label">${sum.retried ? 'Nota atualizada' : 'Nota'}</span>
            <span class="big tone-${tone(pct)}">${fmtPct(pct)}</span>
            <span class="muted small">${scoreNote}</span>
          </div>
          <div class="result-hero__info">
            <span class="badge ${passed ? 'badge--ok' : 'badge--bad'}">${passed ? '✓ Aprovado' : '✗ Reprovado'}${sum.retried ? ' na 1ª tentativa' : ''}</span>
            <h1>${esc(rv.label)}</h1>
            <p class="muted">${fmtDate(rv.first.submittedAt)} · ${sum.total} questões</p>
          </div>
        </div>

        <div class="conclusion__actions">
          ${act.retry ? `<button type="button" class="btn btn--primary" data-action="retry">${retryLabel}</button>` : ''}
          <button type="button" class="btn${act.retry ? '' : ' btn--primary'}" data-action="open-answers">Ver respostas completas</button>
        </div>
        ${!act.retry && sum.fixed ? '<p class="muted small conclusion__note">Você corrigiu todas as que tinha errado.</p>' : ''}

        <div class="stat-grid">
          ${statTile('Certas de primeira', sum.ok, `de ${sum.total} questões`)}
          ${sum.retried ? statTile('Corrigidas no refazer', sum.fixed, `de ${sum.fixed + sum.wrong} erradas na 1ª tentativa`) : ''}
          ${statTile('Erradas', sum.wrong, blanks && !sum.retried ? `inclui ${blanks} em branco` : 'em branco conta como erro')}
          ${statTile('Tempo da 1ª tentativa', fmtDuration(sc.usedSec), `média de ${fmtDuration(sc.avgSec)} por questão`)}
        </div>

        <div class="two-col">
          <section class="panel">
            <h2>Desempenho por domínio</h2>
            <p class="muted small">1ª tentativa, do pior para o melhor</p>
            ${bars(sc.byDomain)}
          </section>
          <section class="panel">
            <h2>Desempenho por tópico</h2>
            <p class="muted small">1ª tentativa, do pior para o melhor</p>
            ${bars(sc.byTopic)}
          </section>
        </div>

        <div class="actions">
          ${sum.fixed + sum.wrong ? `<button type="button" class="btn btn--ghost" data-action="copy-md">${ICONS.copy}<span>Copiar erros em Markdown</span></button>` : ''}
          <button type="button" class="btn" data-action="home">Voltar ao início</button>
        </div>
      </section>`;
    window.scrollTo(0, 0);
  }

  /* ---------- Respostas completas ---------- */

  // Status sempre com ícone e texto, nunca só pela cor.
  const STATUS = {
    ok: { icon: '✓', label: 'Certa' },
    fixed: { icon: '↻', label: 'Corrigida no refazer' },
    wrong: { icon: '✗', label: 'Errada' },
  };

  const FILTER_TABS = [
    { value: 'all', label: 'Todas' },
    { value: 'wrong', label: 'Erradas' },
    { value: 'right', label: 'Certas' },
  ];

  function showAnswers(rv) {
    const rows = reviewRows(rv, BY_ID);
    if (!rows.length) {
      toast('As questões desta tentativa não existem mais no banco.');
      showHome();
      return;
    }
    const saved = store.get(KEYS.answersUi, null);
    const ui = saved && saved.id === rv.id ? saved : { filter: 'all', domain: 'all', qid: null };
    view = { name: 'answers', review: rv, rows, filter: ui.filter, domain: String(ui.domain), qid: ui.qid, mapOpen: null };
    stopTimer();
    clearTimerSlot();
    setRoute(`respostas/${encodeURIComponent(rv.id)}`);
    renderAnswers();
    window.scrollTo(0, 0);
  }

  function answersList() {
    return filterReviewRows(view.rows, view.filter, view.domain);
  }

  // Re-desenha e guarda filtro + questão atual (recarregar volta ao mesmo ponto).
  function updateAnswers() {
    renderAnswers();
    store.set(KEYS.answersUi, { id: view.review.id, filter: view.filter, domain: view.domain, qid: view.qid });
  }

  function setAnswersFilter(value) {
    if (view.name !== 'answers') return;
    view.filter = FILTER_TABS.some((t) => t.value === value) ? value : 'all';
    updateAnswers();
  }

  function setAnswersDomain(value) {
    if (view.name !== 'answers') return;
    view.domain = value;
    updateAnswers();
  }

  function answersGoto(qid) {
    if (view.name !== 'answers') return;
    view.qid = qid;
    view.mapOpen = true;
    updateAnswers();
    window.scrollTo(0, 0);
  }

  function answersStep(delta) {
    if (view.name !== 'answers') return;
    const list = answersList();
    const j = list.findIndex((r) => r.q.id === view.qid) + delta;
    if (j < 0 || j >= list.length) return;
    view.qid = list[j].q.id;
    updateAnswers();
    window.scrollTo(0, 0);
  }

  function onAnswersKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'select' || tag === 'input' || tag === 'textarea') return;
    if (document.getElementById('dlg').open) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      answersStep(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      answersStep(-1);
    }
  }

  function renderAnswers() {
    const v = view;
    const rv = v.review;
    const openNow = $app.querySelector('.rv-mapwrap');
    if (openNow && v.mapOpen === null) v.mapOpen = openNow.open;
    const domains = DOMAIN_IDS.filter((d) => v.rows.some((r) => r.q.domain === d));
    if (!(v.domain === 'all' || domains.includes(Number(v.domain)))) v.domain = 'all';
    const list = answersList();
    let pos = list.findIndex((r) => r.q.id === v.qid);
    if (pos < 0 && list.length) {
      pos = 0;
      v.qid = list[0].q.id;
    }
    const row = pos >= 0 ? list[pos] : null;
    const sum = reviewSummary(v.rows);

    const tabs = FILTER_TABS.map((t) => {
      const n = filterReviewRows(v.rows, t.value, v.domain).length;
      const on = v.filter === t.value;
      return `<button type="button" class="rv-tab${on ? ' is-on' : ''}" data-action="ans-filter" data-value="${t.value}" aria-pressed="${on}">${esc(t.label)} <span class="rv-tab__n">${n}</span></button>`;
    }).join('');
    const domainSelect = domains.length > 1
      ? `<label class="rv-domain"><span class="sr-only">Domínio</span>
          <select id="ans-domain">
            <option value="all"${v.domain === 'all' ? ' selected' : ''}>Todos os domínios</option>
            ${domains.map((d) => `<option value="${d}"${v.domain === String(d) ? ' selected' : ''}>D${d} · ${esc(CONFIG.domains[d].name)}</option>`).join('')}
          </select>
        </label>`
      : '';
    const score = sum.retried ? `nota ${fmtPct(sum.nowPct)} (1ª tentativa ${fmtPct(sum.firstPct)})` : `nota ${fmtPct(sum.firstPct)}`;

    $app.innerHTML = `
      <section class="fullreview">
        <div class="rv-head">
          <button type="button" class="btn btn--ghost btn--sm" data-action="open-conclusion">${ICONS.left}<span>Resumo</span></button>
          <div class="rv-head__title">
            <h1>Respostas completas</h1>
            <p class="muted small">${esc(rv.label)} · ${fmtDate(rv.first.submittedAt)} · ${score}</p>
          </div>
          <button type="button" class="btn btn--ghost btn--sm" data-action="home">Início</button>
        </div>
        <div class="rv-filters">
          <div class="rv-tabs" role="group" aria-label="Filtrar questões">${tabs}</div>
          ${domainSelect}
        </div>
        ${row
          ? `<div class="exam">
              <div class="exam__main">${answerHtml(row, pos, list.length)}</div>
              <aside class="exam__side" aria-label="Mapa das questões">${answersMapHtml(list, row, sum)}</aside>
            </div>`
          : `<section class="panel">
              <p class="muted">Nenhuma questão neste filtro.</p>
              <button type="button" class="btn btn--sm" data-action="ans-filter" data-value="all">Mostrar todas</button>
            </section>`}
      </section>`;
    v.mapOpen = null;
  }

  function answerHtml(row, pos, n) {
    const q = row.q;
    const st = STATUS[row.status];
    // Só mostra o que a pessoa marcou quando a resposta foi diferente da correta.
    const firstWrong = !sameAnswer(q.correct, row.first);
    const lastWrong = !!row.last && !sameAnswer(q.correct, row.last);
    const options = row.item.order
      .map((key, i) => {
        const o = optionOf(q, key);
        const right = q.correct.includes(key);
        const p1 = firstWrong && row.first.includes(key);
        const p2 = lastWrong && row.last.includes(key);
        const cls = right ? ' is-correct' : p1 || p2 ? ' is-wrong' : '';
        const icon = right ? '✓' : p1 || p2 ? '✗' : '';
        const tags = [right ? 'Correta' : '', p1 ? 'Você marcou' : '', p2 ? 'Você marcou no refazer' : ''].filter(Boolean);
        return `<li class="ropt${cls}">
          <div class="ropt__head">
            <span class="ropt__mark" aria-hidden="true">${icon}</span>
            <span class="option__letter">${LETTERS[i]}.</span>
            <span class="ropt__text">${esc(o.text)}</span>
            ${tags.map((t) => `<span class="ropt__tag">${t}</span>`).join('')}
          </div>
          ${whyHtml(o)}
        </li>`;
      })
      .join('');
    const notes = [];
    if (!row.first.length) notes.push('Você deixou em branco.');
    if (row.last && !row.last.length) notes.push('No refazer, também ficou em branco.');
    const filtered = view.filter !== 'all' || view.domain !== 'all';
    return `
      <div class="qhead">
        <span class="qhead__count">Questão <strong>${row.n}</strong> de ${view.rows.length}</span>
        <span class="rv-status rv-status--${row.status}"><span aria-hidden="true">${st.icon}</span>&nbsp;${st.label}</span>
      </div>
      <div class="rv-meta">
        <span class="chip">D${q.domain} · ${esc(q.topic)}</span>
        ${q.type === 'multiple' ? '<span class="chip">Escolha DUAS</span>' : ''}
        ${filtered ? `<span class="muted small">${pos + 1} de ${n} no filtro</span>` : ''}
        <span class="muted small rv-id" title="Use este ID para reportar um erro nesta questão">ID ${esc(q.id)}</span>
      </div>
      <p class="qtext">${markKeywords(q.question, q.trigger)}</p>
      ${notes.map((t) => `<p class="ans-note">${t}</p>`).join('')}
      <ol class="ropts">${options}</ol>
      ${q.trigger ? `<p class="trigger"><strong>Como reconhecer na prova:</strong> ${esc(q.trigger)}</p>` : ''}
      <p class="ref"><strong>Referência:</strong> ${linkify(q.reference)}</p>
      <nav class="qnav" aria-label="Navegação entre as questões">
        <button type="button" class="btn" data-action="ans-prev"${pos === 0 ? ' disabled' : ''}>${ICONS.left}<span>Anterior</span></button>
        <button type="button" class="btn btn--primary" data-action="ans-next"${pos === n - 1 ? ' disabled' : ''}><span>Próxima</span>${ICONS.right}</button>
      </nav>
      <p class="shortcuts">Atalhos: <kbd>←</kbd> <kbd>→</kbd> navegar</p>`;
  }

  function answersMapHtml(list, current, sum) {
    const open = view.mapOpen !== null ? view.mapOpen : window.matchMedia('(min-width: 960px)').matches;
    const cells = list
      .map((r) => {
        const cur = r === current;
        const st = STATUS[r.status];
        return `<button type="button" class="qcell rv-${r.status}${cur ? ' is-current' : ''}" data-action="ans-goto" data-qid="${esc(r.q.id)}" aria-label="Questão ${r.n}: ${st.label}"${cur ? ' aria-current="true"' : ''}>${r.n}<span class="rv-cell__icon" aria-hidden="true">${st.icon}</span></button>`;
      })
      .join('');
    const legend = ['ok', 'fixed', 'wrong']
      .filter((k) => k !== 'fixed' || sum.retried)
      .map((k) => `<li><span class="rv-legend rv-${k}" aria-hidden="true">${STATUS[k].icon}</span>${STATUS[k].label}</li>`)
      .join('');
    return `<div class="side-card">
      <div class="side-stats rv-side-stats">
        <span><strong>${sum.ok}</strong> ${sum.ok === 1 ? 'certa' : 'certas'}</span>
        ${sum.retried ? `<span><strong>${sum.fixed}</strong> ${sum.fixed === 1 ? 'corrigida' : 'corrigidas'}</span>` : ''}
        <span><strong>${sum.wrong}</strong> ${sum.wrong === 1 ? 'errada' : 'erradas'}</span>
      </div>
      <details class="qgrid-wrap rv-mapwrap"${open ? ' open' : ''}>
        <summary>Mapa das questões${list.length !== view.rows.length ? ` (${list.length} no filtro)` : ''}</summary>
        <div class="qgrid rv-map">${cells}</div>
        <ul class="legend">${legend}</ul>
      </details>
    </div>`;
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
