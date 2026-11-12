#!/usr/bin/env node
/*
 * Valida o banco de questões.
 *   node validate.js                              -> valida os 4 arquivos e o banco completo
 *   node validate.js questions/d2-seguranca.json  -> valida só os arquivos informados
 * Sai com código 1 se houver erros.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FILES = [
  { file: 'questions/d1-conceitos.json', domain: 1, name: 'Conceitos de nuvem', weight: 24, examCount: 16 },
  { file: 'questions/d2-seguranca.json', domain: 2, name: 'Segurança e conformidade', weight: 30, examCount: 20 },
  { file: 'questions/d3-tecnologia.json', domain: 3, name: 'Tecnologia e serviços', weight: 34, examCount: 22 },
  { file: 'questions/d4-precos.json', domain: 4, name: 'Cobrança, preços e suporte', weight: 12, examCount: 7 },
];

// Tópicos permitidos por domínio (mantém a taxonomia consistente para os filtros e relatórios).
const TOPICS = {
  1: ['Conceitos de nuvem', 'Economia da nuvem', 'Well-Architected', 'Migração e CAF', 'Ferramentas de migração'],
  2: ['Responsabilidade compartilhada', 'IAM', 'Criptografia', 'Monitoramento e conformidade', 'Serviços de segurança', 'Redes'],
  3: ['Redes', 'Infraestrutura global', 'Computação', 'Armazenamento', 'Bancos de dados', 'IA/ML e análise', 'Implantação e operação', 'Outros serviços'],
  4: ['Opções de compra da EC2', 'Custos e faturamento', 'Suporte e recursos'],
};

const MIN_TOTAL = 200;
const REQUIRED = ['id', 'domain', 'topic', 'type', 'question', 'options', 'correct', 'trigger', 'reference'];

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

function loadFile(entry) {
  const full = path.join(__dirname, entry.file);
  if (!fs.existsSync(full)) {
    err(entry.file, 'arquivo não encontrado');
    return null;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    err(entry.file, `JSON inválido: ${e.message}`);
    return null;
  }
  if (!Array.isArray(data)) {
    err(entry.file, 'o arquivo deve conter uma lista (array) de questões');
    return null;
  }
  return data;
}

function validateQuestion(q, entry, index) {
  const where = `${entry.file} #${index + 1}${q && q.id ? ` (${q.id})` : ''}`;
  if (!q || typeof q !== 'object') {
    err(where, 'questão não é um objeto');
    return;
  }
  REQUIRED.forEach((f) => {
    if (!(f in q)) err(where, `campo obrigatório ausente: ${f}`);
  });

  if (!/^d[1-4]-\d{3}$/.test(q.id || '')) err(where, `id fora do padrão "dN-000": ${q.id}`);
  else if (Number(q.id[1]) !== entry.domain) err(where, `prefixo do id não corresponde ao domínio ${entry.domain}`);
  if (q.domain !== entry.domain) err(where, `domain=${q.domain}, mas o arquivo é do domínio ${entry.domain}`);
  if (!TOPICS[entry.domain].includes(q.topic)) err(where, `tópico desconhecido para o domínio ${entry.domain}: "${q.topic}"`);

  ['question', 'trigger', 'reference'].forEach((f) => {
    if (f in q && !isNonEmptyString(q[f])) err(where, `campo "${f}" vazio`);
  });

  if (q.type !== 'single' && q.type !== 'multiple') {
    err(where, `type deve ser "single" ou "multiple" (veio "${q.type}")`);
    return;
  }

  const options = Array.isArray(q.options) ? q.options : [];
  const correct = Array.isArray(q.correct) ? q.correct : [];
  if (!Array.isArray(q.options)) err(where, 'options deve ser uma lista');
  if (!Array.isArray(q.correct)) err(where, 'correct deve ser uma lista');

  const expectedOptions = q.type === 'single' ? 4 : 5;
  const expectedCorrect = q.type === 'single' ? 1 : 2;
  if (options.length !== expectedOptions) err(where, `${q.type} deve ter ${expectedOptions} opções (tem ${options.length})`);
  if (correct.length !== expectedCorrect) err(where, `${q.type} deve ter ${expectedCorrect} resposta(s) correta(s) (tem ${correct.length})`);

  const keys = options.map((o) => o && o.key);
  const expectedKeys = 'ABCDE'.slice(0, options.length).split('');
  if (keys.join('') !== expectedKeys.join('')) err(where, `chaves das opções devem ser ${expectedKeys.join(', ')} em ordem (veio ${keys.join(', ')})`);
  if (new Set(correct).size !== correct.length) err(where, 'correct tem chaves repetidas');
  correct.forEach((k) => {
    if (!keys.includes(k)) err(where, `correct aponta para opção inexistente: ${k}`);
  });

  const texts = new Set();
  options.forEach((o, i) => {
    const ow = `${where} opção ${o && o.key ? o.key : i + 1}`;
    if (!o || typeof o !== 'object') {
      err(ow, 'opção inválida');
      return;
    }
    if (!isNonEmptyString(o.text)) err(ow, 'sem texto');
    if (!isNonEmptyString(o.explanation)) {
      err(ow, 'sem explanation');
    } else {
      // Convenção do banco: a explicação começa com "Correta." ou "Incorreta.".
      // Isso detecta gabarito trocado (correct apontando para a opção errada).
      const isRight = correct.includes(o.key);
      const startsRight = /^Correta\b/.test(o.explanation.trim());
      const startsWrong = /^Incorreta\b/.test(o.explanation.trim());
      if (isRight && !startsRight) err(ow, 'é a resposta correta, mas a explicação não começa com "Correta."');
      if (!isRight && !startsWrong) err(ow, 'não é a resposta correta, mas a explicação não começa com "Incorreta."');
      // As opções são embaralhadas: a explicação não pode citar letras.
      if (/\b(op[çc][ãa]o|alternativa|letra)\s+[A-E]\b/i.test(o.explanation)) warn(ow, 'explicação cita letra de opção (as opções são embaralhadas)');
    }
    if (isNonEmptyString(o.text)) {
      const t = norm(o.text);
      if (texts.has(t)) err(ow, 'texto de opção repetido na mesma questão');
      texts.add(t);
    }
  });

  const asksTwo = /\(Escolha DUAS\.\)/.test(q.question || '');
  if (q.type === 'multiple' && !asksTwo) err(where, 'seleção múltipla deve terminar com "(Escolha DUAS.)"');
  if (q.type === 'single' && /Escolha DUAS/i.test(q.question || '')) err(where, 'questão single não pode pedir "Escolha DUAS"');
  if (isNonEmptyString(q.trigger) && !q.trigger.includes('→')) warn(where, 'trigger sem "→" (formato sugerido: \'expressão\' → resposta)');
  if (isNonEmptyString(q.reference) && /http:\/\//.test(q.reference)) warn(where, 'referência com http:// (prefira https://)');
}

function main() {
  const args = process.argv.slice(2).map((a) => a.replace(/\\/g, '/').replace(/^\.\//, ''));
  const selected = args.length ? FILES.filter((f) => args.some((a) => a.endsWith(f.file) || f.file.endsWith(a))) : FILES;
  if (args.length && selected.length !== args.length) {
    console.error(`Arquivo(s) não reconhecido(s). Use um destes: ${FILES.map((f) => f.file).join(', ')}`);
    process.exit(1);
  }

  const all = [];
  const perFile = [];
  selected.forEach((entry) => {
    const data = loadFile(entry);
    if (!data) return;
    data.forEach((q, i) => validateQuestion(q, entry, i));
    perFile.push({ entry, data });
    data.forEach((q) => all.push(q));
  });

  // IDs únicos e enunciados repetidos (no conjunto validado).
  const ids = new Map();
  const stems = new Map();
  all.forEach((q) => {
    if (!q || !q.id) return;
    if (ids.has(q.id)) err(q.id, 'id duplicado');
    ids.set(q.id, true);
    if (isNonEmptyString(q.question)) {
      const s = norm(q.question);
      if (stems.has(s)) err(q.id, `enunciado idêntico ao de ${stems.get(s)}`);
      else stems.set(s, q.id);
    }
  });

  // Relatório
  const line = '─'.repeat(64);
  console.log(line);
  console.log('Banco de questões · CLF-C02');
  console.log(line);
  let total = 0;
  let totalMulti = 0;
  perFile.forEach(({ entry, data }) => {
    const multi = data.filter((q) => q && q.type === 'multiple').length;
    total += data.length;
    totalMulti += multi;
    const pctMulti = data.length ? Math.round((multi / data.length) * 100) : 0;
    console.log(`D${entry.domain} · ${entry.name} (${entry.weight}%): ${data.length} questões · ${data.length - multi} single · ${multi} multiple (${pctMulti}%)`);
    const topics = {};
    data.forEach((q) => {
      if (q && q.topic) topics[q.topic] = (topics[q.topic] || 0) + 1;
    });
    Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .forEach(([t, n]) => console.log(`    ${String(n).padStart(3)}  ${t}`));
    if (data.length < entry.examCount) err(entry.file, `só ${data.length} questões; a prova completa precisa de ${entry.examCount} deste domínio`);
    else if (data.length < entry.examCount * 2) warn(entry.file, `${data.length} questões: menos de 2 provas completas sem repetir neste domínio`);
  });
  console.log(line);

  if (perFile.length === FILES.length) {
    const byTopic = {};
    all.forEach((q) => {
      if (q && q.topic) byTopic[q.topic] = (byTopic[q.topic] || 0) + 1;
    });
    console.log('Total por tópico (todos os domínios):');
    Object.entries(byTopic)
      .sort((a, b) => b[1] - a[1])
      .forEach(([t, n]) => console.log(`    ${String(n).padStart(3)}  ${t}`));
    console.log(line);
    if (total < MIN_TOTAL) err('banco', `total de ${total} questões; o mínimo é ${MIN_TOTAL}`);
  }
  const pctMultiAll = total ? Math.round((totalMulti / total) * 100) : 0;
  console.log(`Total validado: ${total} questões · ${total - totalMulti} single · ${totalMulti} multiple (${pctMultiAll}%)`);

  if (warnings.length) {
    console.log(`\nAvisos (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  ! ${w}`));
  }
  if (errors.length) {
    console.log(`\nErros (${errors.length}):`);
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('\nResultado: FALHOU');
    process.exit(1);
  }
  console.log('\nResultado: OK');
}

main();
