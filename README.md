# Simulado AWS Certified Cloud Practitioner (CLF-C02)

Simulador local no estilo da prova, com **235 questões originais em PT-BR** (nomes dos serviços em inglês, como na prova).
HTML + CSS + JavaScript puro: sem framework, sem backend e sem dependências.

## Como rodar

Na pasta `AWS_practitioner`:

```bash
npx serve .
```

Abra **http://localhost:3000**.

- **No celular (mesma rede Wi-Fi):** use o endereço `Network` que o `serve` mostra no terminal (ex.: `http://192.168.0.10:3000`). Se o Windows perguntar, permita o Node.js no firewall para redes privadas.
- **Sem npx:** `python -m http.server 3000` e abra `http://localhost:3000`.
- Não abra o `index.html` com duplo clique: em `file://` o navegador bloqueia a leitura dos JSON.

## Validar o banco de questões

```bash
node validate.js                               # banco completo
node validate.js questions/d2-seguranca.json   # um arquivo
```

Confere: IDs únicos; `single` com 4 opções e 1 correta; `multiple` com 5 opções e 2 corretas (e "Escolha DUAS" no enunciado); `explanation` em todas as opções; `correct` apontando para opções que existem e coerente com o "Correta."/"Incorreta." das explicações; tópicos válidos; totais por domínio e por tópico.

## Modos

- **Prova completa:** 65 questões (D1 16 · D2 20 · D3 22 · D4 7), 90 minutos, aviso nos 10 minutos finais e envio automático quando o tempo acaba.
- **Treino rápido:** domínio e/ou tópico + 10, 20 ou 30 questões, com ~1 min 23 s por questão.
- **Refazer só os erros:** botão na tela de resultado.

Nenhuma resposta aparece durante a tentativa. Atalhos no notebook: `A`–`E` responde, `←` `→` navega, `M` marca para revisão.

## Dados salvos

Tudo fica no `localStorage` do navegador: histórico de tentativas, questões já vistas (para priorizar as novas) e a tentativa em andamento (se a página recarregar, o simulado continua e o cronômetro não para). Cada navegador/dispositivo tem o próprio histórico. "Limpar histórico", na tela inicial, apaga tudo.

## Estrutura

```
AWS_practitioner/
├── index.html          página única
├── style.css           tema claro/escuro, responsivo
├── app.js              lógica do simulado
├── validate.js         validação do banco
└── questions/
    ├── d1-conceitos.json    Domínio 1 · Conceitos de nuvem (24%)
    ├── d2-seguranca.json    Domínio 2 · Segurança e conformidade (30%)
    ├── d3-tecnologia.json   Domínio 3 · Tecnologia e serviços (34%)
    └── d4-precos.json       Domínio 4 · Cobrança, preços e suporte (12%)
```

## Observações

- A meta de aprovação aqui é **80%**, para ter margem: a prova real usa nota escalonada de 100 a 1000, com corte em 700, e essa escala não é linear.
- As questões de planos de suporte seguem os planos citados no guia do exame CLF-C02 (Basic, Developer, Business, Enterprise On-Ramp e Enterprise). Se o site da AWS mostrar nomes ou planos diferentes, vale o guia do exame.
- Para incluir questões novas, siga o formato dos arquivos JSON e rode `node validate.js`.
