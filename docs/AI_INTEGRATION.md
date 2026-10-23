# Integração do consultor virtual com a OpenAI

O consultor virtual tem dois provedores, escolhidos por `AI_PROVIDER`:

| `AI_PROVIDER` | Provedor | Custo |
|---|---|---|
| `mock` (padrão) | `MockJourneyAIProvider`: respostas determinísticas, sem rede | nenhum |
| `external` | `ExternalJourneyAIProvider`: OpenAI, Responses API + Structured Outputs | tokens da conta OpenAI |

A interface, as regras de negócio e a persistência são as mesmas nos dois modos.

## 1. Onde fica cada peça

```
src/lib/journey-ai/
  types.ts              # JourneyAIProvider, JourneyAIRequest, JourneyAIInput, JourneyAIUsage
  response-schema.ts    # contrato JSON da resposta (Zod) — validado no servidor
  provider.ts           # feature flag AI_PROVIDER=mock|external
  mock-provider.ts      # APENAS SIMULAÇÃO, sem IA (padrão; só com AI_PROVIDER=mock)
  mock-heuristics.ts    # heurísticas determinísticas usadas pelo mock
  external-provider.ts  # integração com a OpenAI (Responses API)
  openai-schema.ts      # schema JSON estrito (Structured Outputs) e conversão p/ o contrato
  jornada-impacto-system-prompt.md  # instruções completas do agente (instrução principal)
  system-prompt.ts      # carrega o .md + adaptações da plataforma + contrato; JOURNEY_PROMPT_VERSION
  proposal-guards.ts    # regras de condução: duração do projeto e ordem meta → ficha
src/lib/journey/
  proposal-schemas.ts   # formato de cada tipo de proposta (payload)
  rules.ts              # regras metodológicas aplicadas no servidor
  proposal-rules.ts     # regras aplicadas a propostas e edições
src/server/journey/
  turn.ts               # executa um turno: chama o provedor, valida, grava e registra uso
  service.ts            # mensagens, "tentar novamente", aprovação de propostas e etapas
  apply.ts              # aplica ao banco SOMENTE propostas aprovadas
scripts/ai-check.ts     # teste de uma chamada real (npm run ai:check)
```

Fluxo de um turno (`POST /api/projects/[id]/journey/messages`):

1. A rota valida sessão, organização e entrada (Zod).
2. `turn.ts` monta o `JourneyAIRequest` a partir do banco (snapshot aprovado,
   estado transitório, proposta pendente, últimas mensagens e a entrada).
3. O provedor devolve a resposta. O servidor valida com `journeyAIResponseSchema`
   e o `payload` da proposta com o schema do tipo (`proposal-schemas.ts`).
4. A mensagem é gravada; se houver proposta, ela é gravada como `PENDING` e
   substitui (`SUPERSEDED`) a pendente anterior.
5. Nada aprovado muda. A pessoa aprova/edita/exclui a proposta em
   `POST /api/projects/[id]/journey/proposals/[proposalId]`, onde o servidor
   aplica **as regras metodológicas** (`proposal-rules.ts`) antes de gravar.

**A IA nunca grava atividade, resultado, impacto ou plano de evidências.** Ela
apenas propõe; a persistência só acontece após aprovação explícita da pessoa.

## 2. Configuração

| Variável | Obrigatória | Descrição |
|---|---|---|
| `AI_PROVIDER` | não (padrão `mock`) | `mock` ou `external` |
| `OPENAI_API_KEY` | sim, se `external` | chave da OpenAI — **só no servidor, nunca versionar** |
| `OPENAI_MODEL` | não (padrão `gpt-6.1-sol`) | modelo usado nas chamadas; `gpt-5.4` foi o testado. Evite `gpt-5.4-mini`: em testes, metade das respostas trouxe palavras com caracteres de outro alfabeto (o servidor as recusa) |
| `OPENAI_TIMEOUT_MS` | não (padrão 60000) | tempo máximo por chamada |
| `OPENAI_REASONING_EFFORT` | não | `none`, `minimal`, `low`, `medium` ou `high`; só para modelos com raciocínio |

Segurança da chave:

- é lida apenas em `external-provider.ts`, que importa `server-only` (o build
  falha se algum componente do navegador tentar importá-lo);
- **nunca** use `NEXT_PUBLIC_OPENAI_API_KEY`: variáveis com esse prefixo vão para
  o navegador;
- a chave não aparece em mensagens de erro, logs nem no banco.

Em produção (Docker Compose), defina as variáveis no `.env` ao lado do
`docker-compose.yml`; o serviço `app` as repassa ao container.

Com `AI_PROVIDER=external` e `OPENAI_API_KEY` ausente, o consultor responde com
um erro amigável indicando a variável que falta (nenhum dado é alterado).

### Alternar entre mock e OpenAI

```env
AI_PROVIDER="mock"       # testes sem custo
AI_PROVIDER="external"   # OpenAI
```

Reinicie a aplicação depois de trocar (`npm run dev` ou
`docker compose up -d --build app`). Os testes automatizados (`npm run test`)
nunca chamam a OpenAI: usam o mock e um cliente OpenAI simulado.

### Testar a integração

```bash
npm run ai:check
```

Faz **uma** chamada real com um projeto fictício (sem ler nem gravar no banco) e
mostra a resposta validada e os tokens usados. Consome tokens da conta.

Teste ponta a ponta: com `AI_PROVIDER=external`, crie um projeto, aprove o
contexto e converse com o consultor na etapa de atividades.

## 3. Como a chamada é feita

`ExternalJourneyAIProvider.respond` usa o SDK oficial `openai`:

```ts
client.responses.create({
  model: OPENAI_MODEL,                       // padrão gpt-6.1-sol
  instructions: buildJourneySystemPrompt() + OPENAI_FORMAT_NOTES,  // relê o .md a cada chamada
  input: [...historicoRecente, { role: "user", content: contexto + entradaDoTurno }],
  text: { format: { type: "json_schema", name: "journey_ai_response", strict: true, schema } },
  max_output_tokens: 900,
  store: false,                              // a OpenAI não guarda a conversa
}, { maxRetries: 0, timeout: OPENAI_TIMEOUT_MS });
```

O que vai ao modelo:

- **instruções**: as instruções completas do agente
  (`jornada-impacto-system-prompt.md`, íntegras), as adaptações da plataforma
  (`PLATFORM_ADAPTATIONS`, com a regra de coerência temporal) e as convenções do
  formato estrito;
- **contexto estruturado** (`buildModelContext`): duração total do projeto em
  meses e data de início (explícitas), projeto, etapa atual, etapas e
  decisões aprovadas (atividades, resultados, impacto), rascunho e proposta
  pendente;
- **histórico recente** (`recentHistory`): só mensagens da etapa atual, no
  máximo 10, cada uma truncada em 2.000 caracteres;
- **entrada do turno** (`describeInput`): a nova mensagem da pessoa, a opção
  escolhida ou o evento (proposta aprovada, etapa aprovada…).

Sem ferramentas: nenhuma busca web, arquivo, imagem ou chamada adicional.

### Structured Outputs

O schema estrito fica em `openai-schema.ts` e espelha o contrato da seção 4 e os
formatos da seção 5. O modo estrito exige que todo campo seja obrigatório, por
isso a saída do modelo usa duas convenções, convertidas por `fromOpenAIOutput`:

| Saída do modelo | No contrato do sistema |
|---|---|
| `"proposal": null` | sem proposta |
| `"state": {"kind": "KEEP"}` | mantém o rascunho atual |
| `"state": null` | limpa o rascunho |

Depois da conversão, a resposta é validada **de novo com Zod**
(`journeyAIResponseSchema` e o schema do tipo da proposta) antes de qualquer
gravação.

### Falhas

Nenhuma falha gera tentativas automáticas (`maxRetries: 0`). O turno que falhou
fica guardado em `JourneyConversation.failedInput`; o chat mostra uma mensagem
clara com o botão **Tentar novamente**, que repete o turno sem duplicar a
mensagem (a mensagem digitada já está gravada na conversa). O próximo turno bem
sucedido limpa esse registro.

| Situação | Status registrado | Mensagem à pessoa |
|---|---|---|
| tempo esgotado | `TIMEOUT` | o consultor demorou demais |
| chave recusada (401/403) | `API_ERROR` | problema de configuração; avisar a equipe |
| limite de uso (429) | `API_ERROR` | limite de uso atingido; aguardar |
| outra falha da API | `API_ERROR` | não conseguiu responder agora |
| resposta truncada (900 tokens) | `INCOMPLETE` | resposta incompleta |
| recusa do modelo | `REFUSED` | reformular a mensagem |
| JSON fora do contrato | `INVALID_RESPONSE` | formato inesperado |

### Registro de uso

Cada chamada (sucesso ou falha) grava uma linha em `ai_usage` (modelo
`AiUsage`): `projectId`, `model`, `inputTokens`, `outputTokens`, `status` e
`createdAt`. Não guarda a chave, o conteúdo das mensagens nem custos, e nada
disso é exibido à pessoa usuária nesta versão.

## 4. Contrato JSON da resposta

```jsonc
{
  "message": "texto curto ao usuário (markdown simples: **negrito** e quebras de linha)",
  "currentStage": "CONTEXT | ACTIVITIES | OUTCOMES | IMPACT | EVIDENCE_PLAN",
  "proposal": {                        // opcional
    "type": "ACTIVITY | OUTCOME | IMPACT | EVIDENCE_PLAN",
    "payload": { }                     // ver seção 5
  },
  "actions": [
    { "id": "string", "label": "string",
      "intent": "APPROVE | EDIT | DELETE | ADD | CONTINUE | SHOW_EXAMPLES" }
  ],
  "requiresApproval": true,
  "state": null                        // opcional: rascunho transitório (seção 6)
}
```

Ações com significado fixo para o servidor e a interface:

| id | efeito |
|---|---|
| `approve-stage` | servidor valida se a etapa atual está completa e a aprova |
| `approve-proposal` / `edit-proposal` / `reject-proposal` | decisão sobre a proposta pendente |
| `navigate:/projetos/...` | abre uma página interna do projeto |

Qualquer outro `id` volta ao provedor como `input: { kind: "ACTION", actionId, intent, label }`.
O servidor só aceita ações oferecidas na última mensagem do consultor.

Eventos que o provedor recebe (`input.kind = "EVENT"`): `PROPOSAL_APPROVED`,
`PROPOSAL_REJECTED`, `STAGE_APPROVED`, `STAGE_REOPENED`.

## 5. Formatos de `payload`

A proposta deve pertencer à etapa atual (`ACTIVITY`→Atividades,
`OUTCOME`→Resultados de médio prazo, `IMPACT`→Impacto, `EVIDENCE_PLAN`→Plano). Campos de texto
opcionais vazios ou `null` são registrados como “a definir”.

**ACTIVITY** — dois formatos, na ordem da Etapa 2 das instruções:

2.1 Lista de atividades (só as ações; só em resposta a uma mensagem da pessoa):
```json
{ "step": "LIST", "activities": [{ "description": "Ofertar oficinas de robótica educacional com sucata" }] }
```

2.3 Ficha de uma atividade da lista (`activityId`), depois da pergunta do que será ofertado:
```json
{
  "activityId": "<id da atividade da lista>",
  "description": "Realizar capacitações técnicas ... para as famílias participantes.",
  "target": { "description": "12 encontros com 40 famílias", "deadline": "até o 6º mês", "quantity": 12, "unit": "encontros", "durationMonths": 6, "period": null },
  "indicators": [{ "name": "Número de encontros realizados", "explanation": "Observa se a oferta foi cumprida." }],
  "evidences": [{ "description": "Lista de presença" }]
}
```

**OUTCOME** — três passos:
```json
{ "step": "STATEMENTS", "outcomes": [{ "statement": "as famílias participantes ampliem ...", "relatedActivityIds": ["<id>"] }], "explicitRequestForMore": false }
{ "step": "DETAIL", "outcomeId": "<id>", "target": "Até o final do projeto, 50% das famílias ...", "indicators": [{ "name": "...", "explanation": null }], "verification": "Questionário de percepção das famílias" }
// Formatos antigos, ainda aceitos (a IA usa só DETAIL):
{ "step": "TARGET", "outcomeId": "<id>", "target": "Até o final do projeto, ..." }
{ "step": "INDICATOR", "outcomeId": "<id>", "indicators": [{ "name": "...", "explanation": null }], "verification": "Relatório de evolução das famílias" }
```

**IMPACT** — dois passos:
```json
{ "step": "STATEMENT", "statement": "Contribuir para que ..." }
{ "step": "FOLLOW_UP", "option": "VISION_ONLY | FOLLOW_UP_CHANGE | FUTURE_EVALUATION",
  "followUps": [{ "description": "...", "target": null, "indicator": null, "verification": null, "periodAfterEnd": "12 meses após o encerramento", "notes": null }] }
```

**EVIDENCE_PLAN**
```json
{ "items": [{ "sourceType": "ACTIVITY | OUTCOME | IMPACT", "sourceId": "<id>",
  "collectionTiming": "...", "responsible": null, "instrument": "...", "pending": "..." }] }
```
Meta, indicador e verificação do plano são sempre recalculados pelo servidor a
partir do conteúdo aprovado (o plano não reinventa indicadores).

## 6. Estado transitório (`state`)

Opcional. Guarda o rascunho em construção entre turnos (JSON em
`JourneyConversation.state`). Formatos aceitos:

```json
{ "kind": "ACTIVITY_DRAFT", "step": "CONFIRM_DESCRIPTION | ASK_TARGET", "description": "...", "target": "meta já informada ou null" }
{ "kind": "ACTIVITIES_REVIEW" } · { "kind": "OUTCOMES_REVIEW" } · { "kind": "IMPACT_REVIEW" }
{ "kind": "IMPACT_FOLLOW_UP_DRAFT", "option": "FOLLOW_UP_CHANGE | FUTURE_EVALUATION" }
```

Omitir `state` mantém o estado atual; `null` limpa.

## 7. Regras que valem para qualquer provedor (garantidas no servidor)

- Atividade precisa ser ação concreta (objetivos como “conscientizar jovens” são recusados).
- No máximo 3 mudanças de médio prazo, salvo solicitação expressa (até 6).
- Termos abstratos (“mais conscientes”, “mais capacitados”, “autoestima”) são recusados.
- Mudanças que dependem de ações não realizadas (ex.: emprego sem encaminhamento) são recusadas.
- Foto, lista de presença e relatório de execução não valem como verificação de mudança.
- Indicador do resultado só depois da meta aprovada.
- Impacto formulado como contribuição (termos como “erradicar” ou “acabar com” são recusados).
- Mensagens com CPF, telefone, e-mail, RG ou NIS são recusadas.
- Nenhuma proposta altera dados aprovados sem ação explícita da pessoa.
- Ordem da Etapa 2 (`proposal-guards.ts`): lista de atividades (2.1) só em resposta à
  pessoa; nenhuma ficha antes de a lista existir; ficha só para atividade da lista e
  depois da pergunta do que será ofertado (2.2) — senão é descartada e a pergunta é
  feita; ficha de atividade fora da lista vira proposta de incluí-la na lista.
- Respostas da IA com letras de outro alfabeto (híndi, chinês, cirílico...) são
  recusadas inteiras (`hasForeignScript`), com a opção “Tentar novamente”.
- Coerência temporal: `target.durationMonths` (inteiro, opcional; null = “a definir”)
  nunca pode ser maior que a duração do projeto, e `target.period`
  `BEFORE_PROJECT`/`AFTER_PROJECT` exige esclarecimento. A comparação é numérica:
  `proposal-guards.ts` descarta a ficha na resposta da IA e devolve um pedido de
  ajuste, e `proposal-rules.ts` impede aprovar ou editar uma atividade incoerente.

## 8. Prompt do agente

As instruções completas do agente estão em
`src/lib/journey-ai/jornada-impacto-system-prompt.md`, mantidas como foram
aprovadas. O provedor externo relê esse arquivo a cada chamada e o envia como
instrução principal, seguido de `PLATFORM_ADAPTATIONS` (etapas desta plataforma,
fichas estruturadas e coerência temporal) e de `RESPONSE_CONTRACT` (não remova).

Ao alterar o `.md` ou `system-prompt.ts`, suba `JOURNEY_PROMPT_VERSION`. Cada
mensagem da IA grava essa versão em `journey_message.promptVersion` (null no
mock), só para auditoria e depuração. O `.md` entra na imagem Docker por
`outputFileTracingIncludes` em `next.config.ts`.

Em desenvolvimento, o cabeçalho do chat mostra temporariamente “Modo IA: Mock”
ou “Modo IA: OpenAI”, para confirmar qual provedor está respondendo.

## 9. Checklist para ativar

1. Configurar `OPENAI_API_KEY` (e, se quiser, `OPENAI_MODEL`) no `.env` do servidor.
2. Rodar `npm run ai:check` e conferir a resposta.
3. Trocar `AI_PROVIDER=mock` por `AI_PROVIDER=external`.
4. Rodar `npm run test` (os testes de contrato continuam valendo, sem custo) e
   testar um projeto completo em homologação.
5. Reiniciar: `docker compose up -d --build app`.
