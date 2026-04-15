# Memória do Projeto DadosPGINPE

Atualizado em: 08/04/2026

## Objetivo

Publicar dados da pós-graduação do INPE extraídos de MDB em página estática (`github.io`), com foco em:
- listagem de alunos;
- estatísticas gerais;
- admissões por ano;
- formados por ano de conclusão.

## Estrutura Ativa

- `index.html`: página principal com links para `alunos`, `estatísticas`, `admissões` e `formados`.
- `alunos.html` + `alunos.js`: tabela Tabulator de alunos.
- `estatisticas.html` + `estatisticas.js`: gráficos Plotly (sexo e nacionalidade; geral + por programa).
- `admissao.html` + `admissao.js`: gráficos e tabelas de admissões por ano.
- `formados.html` + `formados.js`: gráficos e tabelas de concluintes por ano de conclusão.
- `transicoes.html` + `transicoes.js`: matriz de transição e Sankey Mestrado->Doutorado.
- `styles.css`: estilos compartilhados.
- `app.js`: atualiza rodapé com data do MDB usando `Data/mdb_metadata.json`.

## Dados em Uso

- `Data/mdb_metadata.json`
- `Data/alunos_lista.json`
- `Data/logs/alunos_lista_extract_log.json`
- `Data/transicao_cic_mestrado_doutorado.json`
- `Data/transicao_cic_mestrado_doutorado.csv`
- `Data/logs/transicao_cic_mestrado_doutorado_log.json`

## Extração e Regras

Scripts:
- `scripts/extract_mdb_update_metadata.py`
- `scripts/extract_alunos_lista.py`
- `scripts/extract_transicao_cic.py`

Fluxo:
1. Colocar MDB em `RawData/` (ignorado no Git).
2. Rodar:
   - `python3 scripts/extract_mdb_update_metadata.py`
   - `python3 scripts/extract_alunos_lista.py`
   - `python3 scripts/extract_transicao_cic.py`

Regras principais de `extract_alunos_lista.py`:
- base em `CURSO_AL` (chave `REG_ALUNO` normalizada para `XXX/YYYY`);
- join com `GDRPESS` para dados pessoais;
- descarta registros inválidos de acordo com campos obrigatórios;
- normaliza `SIGLA_CURS` para 8 códigos: `ISO`, `PGAST`, `PGCAP`, `PGCST`, `PGMET`, `PGETE`, `PGGES`, `PGSER`;
- mapeamentos aplicados:
  - `ANS* -> PGCAP`
  - `ETE* -> PGETE`
  - `CEA*` e `GES* -> PGGES`
  - `ISO* -> ISO`
- normalização de sexo:
  - `Maculino` e `Masculino -> Masculino`
  - `Feminino -> Feminino`
  - demais -> `Não Informado`
- normalização de nacionalidade:
  - `Brasileiro`, `Brasilera`, `Brasileira -> Brasileira`
  - `Estrangeiro`, `Estrangeira -> Estrangeira`
  - demais -> `Não Informada`
- inclui no JSON:
  - `d_adimissa`
  - `d_final`
  - `d_situacao`

## Regras de Painéis

`alunos.html`:
- usa `Data/alunos_lista.json`;
- filtros e ordenação via Tabulator.

`estatisticas.html`:
- base em todos os alunos válidos;
- `ISO` é ignorado nas estatísticas por programa.

`admissao.html`:
- usa ano de `d_adimissa`;
- descarta `ISO`;
- descarta `NIVEL` nulo;
- considera `ISOLADO` somente como `Isolado` para normalização na extração, mas não entra nos gráficos por programa;
- inclui tabela (12 anos) por programa com `M`, `D`, `T`;
- gráficos por programa compartilham mesma escala Y por grupo.

`formados.html`:
- filtra `STATUS = "Concluído"`;
- descarta `ISO`;
- usa ano de conclusão com fallback:
  - `d_final`, se não houver
  - `d_situacao`;
- possui:
  - gráfico geral empilhado por nível;
  - gráfico por nível empilhado por programa;
  - mini-gráficos por programa;
  - tabela resumo por programa (`Mestrado`, `Doutorado`, `Total`);
  - tabela anual sem programa com `Mestrado`, `Doutorado`, `M+D (ano)`, `M+D acumulado`;
  - tabela por programa nos últimos 12 anos (`M`, `D`, `T`).

## Matriz de Transição CIC (Mestrado -> Doutorado)

- Base: `CURSO_AL` + `GDRPESS` via `REG_ALUNO`.
- Identificador do aluno: `CIC` (somente dígitos), sem fallback para `REG_ALUNO`.
- Categorias: `PGAST`, `PGCAP`, `PGCST`, `PGMET`, `PGETE`, `PGGES`, `PGSER`, `Outros`.
- Regra de seleção do programa por nível: primeiro registro por `D_ADIMISSA` no nível.
- `Outros` representa ausência do nível correspondente (só M ou só D) e/ou ausência de programa reconhecido entre os 7.
- Último snapshot:
  - alunos com CIC e nível M/D: `4084`
  - com Mestrado: `3009`
  - com Doutorado: `1956`
  - com M e D: `881`
  - só Mestrado: `2128`
  - só Doutorado: `1075`

## Estado Atual da Página de Transições

- Arquivos:
  - `transicoes.html`
  - `transicoes.js`
- A página mostra:
  - tabela da matriz de transição (correta e consistente com o JSON);
  - Sankey Plotly alimentado por `Data/transicao_cic_mestrado_doutorado.json`.
- O Sankey está atualmente com `arrangement: "snap"` (sem `x/y` fixos), após reversão solicitada.
- Ponto pendente para próximo ciclo: alinhar ordem visual do lado esquerdo/direito do Sankey exatamente com `categories` do JSON, sem gerar ambiguidade de leitura.

## Snapshot de Referência (última extração)

Fonte:
- `source_file`: `RawData/Academxp_20250912.mdb`
- `generated_at_utc`: `2026-03-22T23:00:38.488372+00:00`

Totais:
- `CURSO_AL` total: `8959`
- importados com sucesso: `8921`
- programa não reconhecido: `2` (`ECOSDA`, `ECOTEC`)

Formados (não ISO):
- `Concluído`: `3326`
- com data de conclusão válida: `3319`
- sem data de conclusão: `7`
- últimos anos:
  - `2023`: `124`
  - `2024`: `105`
  - `2025`: `75`

Resumo formados por programa (com data de conclusão):
- `PGAST`: M `104`, D `62`, T `166`
- `PGCAP`: M `331`, D `226`, T `557`
- `PGCST`: M `0`, D `106`, T `106`
- `PGETE`: M `467`, D `286`, T `753`
- `PGGES`: M `211`, D `213`, T `424`
- `PGMET`: M `323`, D `211`, T `534`
- `PGSER`: M `609`, D `170`, T `779`

## Limpeza já Realizada

Removidos como legados/não usados:
- `catalogo-tabelas.html`
- `docentes.html`
- `indicadores-graficos.html`
- `metadados.html`
- `series-historicas.html`
- `scripts/extract_gdrpess_alunos.py`
- `Data/gdrpess_alunos.json`
- `Data/logs/gdrpess_alunos_extract_log.json`

## Operação Git

- `commit.sh` faz:
  - `git add -A`
  - `git commit -m "..."`
  - `git push` (ou `git push -u origin <branch>` se upstream não existir)

## Consultas Ad Hoc MDB (abril/2026)

Contexto:
- Banco: `RawData/Academxp_20250912.mdb`
- Ferramentas usadas: `mdb-sql`, `awk`, `sort`, `join`.
- Observação: no `mdb-sql` local, consultas com `JOIN/alias` falharam; cruzamentos foram feitos com arquivos intermediários + `join` do shell.

Convenções de ano usadas:
- Disciplinas (`HISTORIC`): `ano = int(PERIODO/100)` (ex.: `202301 -> 2023`).
- `CURSO_AL`: `ano` extraído de `D_ADIMISSA` (`MM/DD/YY`) com pivot: `YY>=70 => 19YY`, senão `20YY`.

Comandos-base (reprodutíveis):

```bash
MDB="RawData/Academxp_20250912.mdb"

# 1) Base de nomes/nível por REG_ALUNO
printf "select REG_ALUNO,NIVEL,NOME from GDRPESS;\n" \
  | mdb-sql -P -H -F -d '|' "$MDB" \
  | sort -t'|' -k1,1 > /tmp/gdrpess_nivel_nome.lex.psv
```

```bash
# 2) Matrículas por disciplina (trocar MAT para CAP372/CAP399/CAP425)
MAT="CAP372"
printf "select REG_ALUNO,PERIODO from HISTORIC where SIGLA_MAT='${MAT}';\n" \
  | mdb-sql -P -H -F -d '|' "$MDB" > /tmp/historic_${MAT}.psv

# Recorte usado para tabelas comparativas de 5 anos: 2020..2024
awk -F'|' 'int($2/100)>=2020 && int($2/100)<=2024' /tmp/historic_${MAT}.psv \
  | sort -t'|' -k1,1 > /tmp/${MAT}_2020_2024.lex.psv

join -t '|' -1 1 -2 1 /tmp/${MAT}_2020_2024.lex.psv /tmp/gdrpess_nivel_nome.lex.psv \
  > /tmp/${MAT}_2020_2024_com_nivel.psv
```

```bash
# 3) Tabela final por ano: Ano | Isolado | M+D | Total
awk -F'|' '{
  y=int($2/100); reg=$1; niv=tolower($3); key=y"|"reg;
  if(!seen[key]++){
    if(niv ~ /^isola/) iso[y]++;
    else if(niv ~ /^mestr/ || niv ~ /^dout/) md[y]++;
    else other[y]++;
    tot[y]++;
  }
}
END{
  for(y=2020;y<=2024;y++) printf "%d|%d|%d|%d\n", y, iso[y]+0, md[y]+0, tot[y]+0;
}' /tmp/${MAT}_2020_2024_com_nivel.psv
```

```bash
# 4) Registros com O_PESQ{1,2,3,4}=69566 e título/status
printf "select REG_ALUNO,D_ADIMISSA,STATUS,O_PESQ1,O_PESQ2,O_PESQ3,O_PESQ4,TITUTESE from CURSO_AL where O_PESQ1=69566 or O_PESQ2=69566 or O_PESQ3=69566 or O_PESQ4=69566;\n" \
  | mdb-sql -P -H -F -d '|' "$MDB" > /tmp/curso_al_pesq69566_status_tese.psv
```

```bash
# 5) Desde 2011: listar SOMENTE os com TITUTESE preenchido
awk -F'|' 'NR==FNR{nome[$1]=$3; nivel[$1]=$2; next}
{
  reg=$1; dt=$2; split(dt,sp," "); split(sp[1],d,"/");
  yy=d[3]+0; ano=(yy>=70?1900+yy:2000+yy);
  if(ano<2011) next;
  tese=$8; gsub(/^[[:space:]]+|[[:space:]]+$/, "", tese); gsub(/^"|"$/, "", tese);
  if(tese=="") next;
  print nome[reg]"|"ano"|"nivel[reg]"|"tese;
}' /tmp/gdrpess_nivel_nome.lex.psv /tmp/curso_al_pesq69566_status_tese.psv \
  | sort -t'|' -k2,2n -k1,1
```

```bash
# 6) Janela de 15 anos (2011..2025): listar os SEM TITUTESE e com STATUS
awk -F'|' 'NR==FNR{nome[$1]=$3; nivel[$1]=$2; next}
{
  reg=$1; dt=$2; status=$3; split(dt,sp," "); split(sp[1],d,"/");
  yy=d[3]+0; ano=(yy>=70?1900+yy:2000+yy);
  if(ano<2011 || ano>2025) next;
  campos="";
  if($4==69566) campos=(campos?campos",":"")"O_PESQ1";
  if($5==69566) campos=(campos?campos",":"")"O_PESQ2";
  if($6==69566) campos=(campos?campos",":"")"O_PESQ3";
  if($7==69566) campos=(campos?campos",":"")"O_PESQ4";
  tese=$8; gsub(/^[[:space:]]+|[[:space:]]+$/, "", tese);
  if(tese=="" || tese=="\"\"") print ano"|"reg"|"nome[reg]"|"nivel[reg]"|"status"|"campos;
}' /tmp/gdrpess_nivel_nome.lex.psv /tmp/curso_al_pesq69566_status_tese.psv \
  | sort -t'|' -k1,1n -k3,3
```

## Observações

- `.gitignore` ignora: `RawData/`, `NOPE/`, `__pycache__/`, `*.pyc`, `.DS_Store`.
- Todas as páginas ativas usam `Images/favicon.svg`.

## Atualização de Sessão (08/04/2026)

### Novas páginas e painéis adicionados

- `ativos.html` + `ativos.js`: evolução anual de alunos ativos (mesmo padrão visual de admissões), incluindo:
  - gráficos por nível (Mestrado/Doutorado) nos últimos 20 anos;
  - versões absolutas e proporcionais (100%);
  - gráfico agregado Mestrado + Doutorado (absoluto e proporcional);
  - mini-gráficos por programa.
- `docentes.html` + `docentes.js`: evolução do número de docentes por ano (geral + miniaturas por programa).
- `producao.html` + `producao.js`: produção em periódicos por ano, com separação:
  - `com_egressos_ou_discentes=true/false`;
  - gráfico geral + 7 mini-gráficos por programa;
  - percentual com dois dígitos em cada barra.
- `anais.html` + `anais.js`: versão equivalente da página de produção para artigos em anais.

### CAPES Docentes (SG_ENTIDADE_ENSINO = INPE)

Arquivos consolidados:
- `Data/inpe_programas_colsucup_docente.csv`
- `Data/inpe_programas_colsucup_docente.json`
- `Data/inpe_docentes_por_ano_programa_colsucup.csv`
- `Data/inpe_docentes_por_ano_programa_colsucup.json`

Objetivo atendido:
- confirmação dos 7 programas INPE por código (`CD_PROGRAMA_IES`) e nome (`NM_PROGRAMA_IES`);
- série anual de quantitativo de docentes por programa.

### Produção em Periódicos (INPE + IN_GLOSA=0)

Arquivos:
- `Data/inpe_artpe_autores_por_artigo_2013_2024_glosa0.csv`
- `Data/inpe_artpe_tp_autor_unicos_2013_2024_glosa0.csv`
- `Data/inpe_artpe_autores_por_artigo_2013_2024_glosa0_simplificado_flags.csv`
- `Data/inpe_artpe_resumo_ano_programa_2013_2024_glosa0.csv`
- `Data/inpe_artpe_resumo_ano_programa_2013_2024_glosa0.json`
- logs em `Data/logs/inpe_artpe_*`

Flags no CSV simplificado:
- `com_discentes`
- `com_egressos`
- `com_egressos_ou_discentes` (substituindo o nome antigo `com_ambos`).

### Produção em Anais (INPE + IN_GLOSA=0)

Extração consolidada 2013-2024:
- `Data/inpe_anais_autores_por_artigo_2013_2024_glosa0.csv`
- `Data/inpe_anais_tp_autor_unicos_2013_2024_glosa0.csv`
- `Data/inpe_anais_autores_por_artigo_2013_2024_glosa0_simplificado_flags.csv`
- `Data/logs/inpe_anais_autores_por_artigo_2013_2024_glosa0_log.json`

Resumo da extração:
- 12 planilhas `bibliografica-anais-*` processadas;
- 4633 artigos únicos;
- anos cobertos: 2013 a 2024;
- `TP_AUTOR` únicos: `-`, `DISCENTE`, `DOCENTE`, `EGRESSO`, `PARTICIPANTE EXTERNO`, `PÓS-DOC`.

### Scripts novos/atualizados

- `scripts/extract_artpe_autores_por_artigo.py`
  - agora aceita `--file-pattern` (permite usar o mesmo extrator para `artpe` e `anais`);
  - normalização de escapes Excel `_xNNNN_` em cabeçalhos e valores (evita categorias duplicadas de `TP_AUTOR`).
- `scripts/build_autores_flags_csv.py`
  - gera CSV simplificado por artigo com `com_discentes`, `com_egressos`, `com_egressos_ou_discentes`.

### Ajuste visual importante (exportação PNG do Plotly)

Problema observado:
- exportar PNG com fundo branco (gráfico aparecia escuro só na página).

Correção aplicada:
- substituição de fundo transparente por fundo escuro fixo `#0d1727` em `paper_bgcolor` e `plot_bgcolor`.
- arquivos ajustados: `admissao.js`, `ativos.js`, `docentes.js`, `estatisticas.js`, `formados.js`, `transicoes.js`, `producao.js`, `anais.js`.

### Ponto de retomada sugerido

- validar visualmente as páginas no navegador após hard refresh;
- se estiver ok, consolidar commit incluindo:
  - páginas novas (`ativos`, `docentes`, `producao`, `anais`);
  - scripts de extração/simplificação;
  - CSVs finais de docentes/periódicos/anais;
  - ajuste global do fundo de exportação PNG.
