#!/usr/bin/env node
/*
 * Testes do simulado (sem dependências).
 *   node test.js
 * Roda: montagem da prova, conclusão e refazer, respostas completas, justificativas,
 * o validador do banco (validate.js) e guardas contra links e arquivos quebrados.
 */
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

// Gerador determinístico para os sorteios.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const NOW = new Date('2026-11-13T12:00:00').getTime();

console.log('Simulado principal');

test('app.js monta a prova completa (65 = 16/20/22/7)', () => {
  const app = require('./app.js');
  const bank = ['d1-conceitos', 'd2-seguranca', 'd3-tecnologia', 'd4-precos'].flatMap((f) => require(`./questions/${f}.json`));
  const exam = app.pickExam(bank, {}, seeded(1));
  assert.strictEqual(exam.length, 65);
  const by = {};
  exam.forEach((q) => (by[q.domain] = (by[q.domain] || 0) + 1));
  assert.deepStrictEqual(by, { 1: 16, 2: 20, 3: 22, 4: 7 });
});

test('node validate.js passa', () => {
  const r = spawnSync(process.execPath, ['validate.js'], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout.split('\n').slice(-12).join('\n'));
});

console.log('Site · nada quebrado');

test('todo link e script local do index.html aponta para um arquivo que existe', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/<script src="app\.js"><\/script>/.test(html), 'index.html carrega app.js');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|#|mailto:)/.test(u));
  refs.forEach((u) => assert.ok(fs.existsSync(path.join(ROOT, u.split(/[?#]/)[0])), `index.html → ${u} não existe`));
});

test('o simulado carrega só os 4 arquivos de questões, e eles existem', () => {
  const app = require('./app.js');
  assert.deepStrictEqual(app.CONFIG.files, ['d1-conceitos', 'd2-seguranca', 'd3-tecnologia', 'd4-precos'].map((f) => `questions/${f}.json`));
  app.CONFIG.files.forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), f));
});

test('o deploy (GitHub Pages) roda os testes e só copia arquivos que existem', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.ok(/node test\.js/.test(wf), 'o deploy roda node test.js');
  const cps = wf.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('cp '));
  assert.ok(cps.length >= 2, 'comandos cp do deploy');
  cps.forEach((l) => l.split(/\s+/).slice(1, -1).forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), `pages.yml copia ${f}, que não existe`)));
});

console.log('Simulado · conclusão e refazer');

const app = require('./app.js');
const simBank = ['d1-conceitos', 'd2-seguranca', 'd3-tecnologia', 'd4-precos'].flatMap((f) => require(`./questions/${f}.json`));
const simById = new Map(simBank.map((q) => [q.id, q]));
const clone = (x) => JSON.parse(JSON.stringify(x));
// Uma questão de cada domínio + mais uma do D1 (single e multiple misturados).
const mixed = [simBank[0], simBank[53], simBank[118], simBank[193], simBank[1]];

// Mesma quantidade de chaves da resposta certa, todas erradas.
function wrongAnswer(q) {
  return q.options.map((o) => o.key).filter((k) => !q.correct.includes(k)).slice(0, q.correct.length);
}

// Sessão enviada com as respostas de answerFn(q, i); [] = em branco.
function sentSession(qs, answerFn, meta) {
  const m = Object.assign({ mode: 'exam', label: 'Prova completa', seconds: 600 }, meta || {});
  const s = app.createSession(qs, m, NOW, seeded(7));
  qs.forEach((q, i) => {
    const a = answerFn(q, i);
    if (a && a.length) s.answers[q.id] = a;
  });
  s.submittedAt = NOW + 60000;
  s.reason = 'manual';
  return s;
}

// 1ª: acerta a 1ª questão, erra as outras (a última em branco).
function firstAttempt() {
  return sentSession(mixed, (q, i) => (i === 0 ? q.correct.slice() : i === 4 ? [] : wrongAnswer(q)));
}

// Refazer ligado à revisão, com as questões que ainda estão erradas. plan(q) → resposta.
function retryOf(rv, plan, meta) {
  const qs = app.pendingIds(rv, simById).map((id) => simById.get(id));
  return sentSession(qs, plan, Object.assign({ mode: 'retry', label: 'Refazer erradas', reviewId: rv.id }, meta || {}));
}

// 1º refazer: corrige mixed[1] e mixed[2], erra mixed[3] de novo, deixa mixed[4] em branco.
const firstRetryPlan = (q) =>
  [mixed[1].id, mixed[2].id].includes(q.id) ? q.correct.slice() : q.id === mixed[3].id ? wrongAnswer(q) : [];

test('acertar tudo: a conclusão não oferece refazer, só "Ver respostas completas"', () => {
  const rv = app.createReview(sentSession(mixed, (q) => q.correct.slice()));
  assert.deepStrictEqual(rv.retries, []);
  assert.deepStrictEqual(app.conclusionActions(rv, simById), { retry: 0, answers: true });
  const sum = app.reviewSummary(app.reviewRows(rv, simById));
  assert.deepStrictEqual([sum.total, sum.ok, sum.fixed, sum.wrong, sum.firstPct, sum.nowPct, sum.retried], [5, 5, 0, 0, 100, 100, false]);
});

test('errar (inclusive em branco): a conclusão oferece refazer todas as erradas', () => {
  const rv = app.createReview(sentSession(mixed, (q, i) => (i % 2 ? [] : wrongAnswer(q))));
  assert.deepStrictEqual(app.pendingIds(rv, simById), mixed.map((q) => q.id));
  assert.deepStrictEqual(app.conclusionActions(rv, simById), { retry: 5, answers: true });
});

test('depois do refazer, a conclusão volta a oferecer as que continuam erradas (regressão de 15/11)', () => {
  const rv = app.createReview(firstAttempt());
  const once = app.addRetry(rv, retryOf(rv, firstRetryPlan));
  assert.deepStrictEqual(app.pendingIds(once, simById), [mixed[3].id, mixed[4].id]);
  assert.deepStrictEqual(app.conclusionActions(once, simById), { retry: 2, answers: true });
  const twice = app.addRetry(once, retryOf(once, (q) => q.correct.slice()));
  assert.strictEqual(twice.retries.length, 2);
  assert.deepStrictEqual(app.conclusionActions(twice, simById), { retry: 0, answers: true });
  const sum = app.reviewSummary(app.reviewRows(twice, simById));
  assert.deepStrictEqual([sum.ok, sum.fixed, sum.wrong, sum.firstPct, sum.nowPct], [1, 4, 0, 20, 100]);
});

test('refazer: guarda à parte, não altera a 1ª tentativa e dá os 3 status', () => {
  const rv = app.createReview(firstAttempt());
  const before = JSON.stringify(rv);
  const retry = retryOf(rv, firstRetryPlan);
  const done = app.addRetry(rv, retry);
  assert.strictEqual(JSON.stringify(done.first), JSON.stringify(rv.first), '1ª tentativa intacta');
  assert.strictEqual(JSON.stringify(rv), before, 'o registro original não é alterado');
  retry.answers[mixed[3].id] = mixed[3].correct.slice(); // mexer na sessão depois não muda a revisão
  const rows = app.reviewRows(done, simById);
  assert.deepStrictEqual(rows.map((r) => r.status), ['ok', 'fixed', 'fixed', 'wrong', 'wrong']);
  assert.deepStrictEqual(rows[3].first, wrongAnswer(mixed[3]));
  assert.deepStrictEqual(rows[3].last, wrongAnswer(mixed[3]));
  assert.deepStrictEqual(rows[4].first, []);
  assert.deepStrictEqual(rows[4].last, [], 'em branco no refazer continua errada');
  assert.strictEqual(rows[0].last, null, 'acertou de primeira: não foi para o refazer');
  const sum = app.reviewSummary(rows);
  assert.deepStrictEqual([sum.ok, sum.fixed, sum.wrong, sum.firstPct, sum.nowPct, sum.retried], [1, 2, 2, 20, 60, true]);
});

test('o refazer só entra na revisão de onde saiu', () => {
  const rv = app.createReview(firstAttempt());
  assert.strictEqual(app.addRetry(rv, retryOf(rv, firstRetryPlan, { reviewId: 'outra' })), null, 'reviewId diferente');
  assert.strictEqual(app.addRetry(rv, retryOf(rv, firstRetryPlan, { reviewId: null })), null, 'sem reviewId');
  assert.strictEqual(app.addRetry(rv, sentSession(mixed, (q) => q.correct.slice(), { reviewId: rv.id })), null, 'sessão que não é refazer');
});

test('Escolha DUAS: meia resposta é erro e as marcações das duas tentativas ficam guardadas', () => {
  const multi = simBank.filter((q) => q.type === 'multiple').slice(0, 2);
  const half = (q) => [q.correct[0], wrongAnswer(q)[0]];
  const rv = app.createReview(sentSession(multi, (q, i) => (i === 0 ? half(q) : q.correct.slice())));
  assert.deepStrictEqual(app.pendingIds(rv, simById), [multi[0].id]);
  const rows = app.reviewRows(app.addRetry(rv, retryOf(rv, (q) => q.correct.slice().reverse())), simById);
  assert.deepStrictEqual(rows.map((r) => r.status), ['fixed', 'ok']);
  assert.deepStrictEqual(rows[0].first, half(multi[0]));
  assert.deepStrictEqual(rows[0].last.slice().sort(), multi[0].correct.slice().sort());
});

test('recarregar a página: sessão e revisão voltam do JSON e continuam ligadas', () => {
  const rv = clone(app.createReview(firstAttempt()));
  const done = clone(app.addRetry(rv, clone(retryOf(rv, firstRetryPlan))));
  assert.ok(done, 'refazer recarregado continua ligado à revisão');
  assert.deepStrictEqual(app.reviewRows(done, simById).map((r) => r.status), ['ok', 'fixed', 'fixed', 'wrong', 'wrong']);
});

console.log('Simulado · respostas completas');

test('filtros: Todas, Erradas (na 1ª tentativa), Certas e domínio', () => {
  const rv = app.createReview(firstAttempt());
  const rows = app.reviewRows(app.addRetry(rv, retryOf(rv, firstRetryPlan)), simById);
  const ids = (list) => list.map((r) => r.q.id);
  assert.strictEqual(app.filterReviewRows(rows, 'all', 'all').length, 5);
  assert.deepStrictEqual(ids(app.filterReviewRows(rows, 'wrong', 'all')), ids(rows.slice(1)), 'inclui as corrigidas no refazer');
  assert.deepStrictEqual(ids(app.filterReviewRows(rows, 'right', 'all')), [mixed[0].id]);
  // mixed = D1, D2, D3, D4, D1; o <select> entrega o domínio como texto.
  assert.deepStrictEqual(ids(app.filterReviewRows(rows, 'all', '1')), [mixed[0].id, mixed[4].id]);
  assert.deepStrictEqual(ids(app.filterReviewRows(rows, 'wrong', 1)), [mixed[4].id]);
  assert.deepStrictEqual(app.filterReviewRows(rows, 'right', '2'), []);
  assert.strictEqual(app.filterReviewRows(rows, 'xyz', 'all').length, 5, 'filtro desconhecido = Todas');
});

test('palavra-chave: marca no enunciado os trechos citados no trigger', () => {
  const trigger = "'quem fez' / 'qual usuário' / 'chamada de API' → AWS CloudTrail";
  const html = app.markKeywords('Qual usuário encerrou a instância <b>?', trigger);
  assert.strictEqual(html, '<mark class="kw">Qual usuário</mark> encerrou a instância &lt;b&gt;?');
  assert.strictEqual(app.markKeywords('Criar alarmes', "'alarme' → CloudWatch"), 'Criar <mark class="kw">alarmes</mark>', 'vai até o fim da palavra');
  assert.strictEqual(app.markKeywords('Escalabilidade', "'cala' → x"), 'Escalabilidade', 'não marca no meio de palavra');
  assert.strictEqual(app.markKeywords('a < b', ''), 'a &lt; b', 'sem trigger: só escapa');
  assert.strictEqual(app.markKeywords('Ir para a AWS', "'Ir' → AWS"), 'Ir para a AWS', 'trechos com menos de 3 letras são ignorados');
  assert.strictEqual(
    app.markKeywords('Uma conexão privada com o data center', "'dedicada/privada' + 'sem internet' → Direct Connect"),
    'Uma conexão <mark class="kw">privada</mark> com o data center',
    'trecho com barra que não aparece inteiro: procura cada parte'
  );
});

test('chaves do localStorage prefixadas com o nome do projeto (GitHub Pages compartilha o domínio)', () => {
  const prefix = 'simulado_aws_practitioner.';
  Object.values(app.KEYS).forEach((k) => assert.ok(k.startsWith(prefix), k));
  ['index.html', 'app.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/['"]clf02\./.test(src), `${f} ainda usa uma chave clf02.`);
  });
  assert.ok(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes(`'${prefix}theme'`), 'index.html: tema com a chave nova');
});

console.log('Simulado · justificativas');

test('alternativa sem justificativa vira "Justificativa pendente"', () => {
  assert.strictEqual(app.justification({ key: 'A', text: 'X' }), 'Justificativa pendente');
  assert.strictEqual(app.justification({ explanation: '   ' }), 'Justificativa pendente');
  assert.strictEqual(app.justification({ explanation: 'Incorreta.' }), 'Justificativa pendente');
  assert.strictEqual(app.justification({ explanation: 'Incorreta. O X faz Y.' }), 'O X faz Y.');
});

test('Markdown dos erros não quebra quando falta justificativa', () => {
  const q = clone(mixed[1]);
  q.options.forEach((o) => delete o.explanation);
  const s = sentSession([q], (x) => wrongAnswer(x));
  const md = app.buildMarkdown(s, app.scoreSession(s, new Map([[q.id, q]])));
  assert.ok(md.includes('Justificativa pendente'), md);
});

console.log('Simulado · validação do banco (validate.js)');

const V = require('./validate.js');
const aSingle = simBank.find((q) => q.type === 'single');
const aMultiple = simBank.find((q) => q.type === 'multiple');
const someWrongOption = (q) => q.options.find((o) => !q.correct.includes(o.key));

test('questões boas passam sem erros', () => {
  assert.deepStrictEqual(V.checkQuestion(clone(aSingle)).errors, []);
  assert.deepStrictEqual(V.checkQuestion(clone(aMultiple)).errors, []);
});

test('reprova alternativa sem justificativa (ausente ou só "Incorreta.")', () => {
  const q = clone(aSingle);
  const o = someWrongOption(q);
  delete o.explanation;
  assert.ok(V.checkQuestion(q).errors.some((e) => e.includes(`opção ${o.key}: sem explanation`)));
  o.explanation = 'Incorreta.';
  assert.ok(V.checkQuestion(q).errors.some((e) => e.includes(`opção ${o.key}`) && /sem justificativa/.test(e)));
});

test('reprova questão sem alternativa correta', () => {
  const q = clone(aSingle);
  q.correct = [];
  assert.ok(V.checkQuestion(q).errors.some((e) => /single deve ter 1 resposta\(s\) correta\(s\) \(tem 0\)/.test(e)));
});

test('reprova quantidade de corretas que não bate com o tipo', () => {
  const m = clone(aMultiple);
  m.correct = m.correct.slice(0, 1);
  assert.ok(V.checkQuestion(m).errors.some((e) => /multiple deve ter 2 resposta\(s\) correta\(s\) \(tem 1\)/.test(e)));
  const s = clone(aSingle);
  s.correct = ['A', 'B'];
  assert.ok(V.checkQuestion(s).errors.some((e) => /single deve ter 1 resposta\(s\) correta\(s\) \(tem 2\)/.test(e)));
});

test('avisa justificativa genérica ("Essa é a definição de X")', () => {
  const q = clone(aSingle);
  someWrongOption(q).explanation = 'Incorreta. Essa é a definição de elasticidade.';
  const r = V.checkQuestion(q);
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /genérica/.test(w)));
});

console.log(`\n${passed} passaram, ${failures.length} falharam.`);
process.exit(failures.length ? 1 : 0);
