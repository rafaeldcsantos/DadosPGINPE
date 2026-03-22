# DadosPGINPE

Repositório para armazenar dados extraídos de um arquivo MDB com informações da pós-graduação do INPE, publicados em uma página `github.io`.

Objetivo deste diretório:
- manter a versão local alinhada com o repositório oficial: `https://github.com/rafaeldcsantos/DadosPGINPE.git`;
- organizar dados brutos, processados e scripts de apoio;
- registrar um fluxo simples de atualização e versionamento.

## Estrutura inicial

- `RawData/`: dados brutos locais (ignorada no Git), incluindo o arquivo `.mdb`.
- `Data/`: saídas processadas para versionamento no Git (JSON/CSV etc.).
- `scripts/`: scripts de extração e transformação.
- `NOPE/`: pasta local ignorada pelo Git.
- `commit.sh`: script para `add + commit + push`.

## Fluxo básico

1. Atualizar o arquivo MDB em `RawData/`.
2. Gerar metadados de atualização do MDB:
   `python3 scripts/extract_mdb_update_metadata.py`
3. Gerar a lista consolidada de alunos (base `CURSO_AL` + join com `GDRPESS`):
   `python3 scripts/extract_alunos_lista.py`
4. Revisar mudanças:
   `git status`
5. Criar commit e push com o script:
   `./commit.sh "mensagem do commit"`

## Primeira extração implementada

Script:
- `scripts/extract_mdb_update_metadata.py`

Saída:
- `Data/mdb_metadata.json`

O script extrai:
- metadados do arquivo (`nome`, `tamanho`, `mtime`);
- formato do banco (`mdb-ver`, ex.: `JET4`);
- data da versão embutida no nome do arquivo (quando existir, ex.: `20250912`);
- maior `DateUpdate` da tabela de sistema `MSysObjects` (indicador de atualização interna do MDB).

Opções de uso:
`python3 scripts/extract_mdb_update_metadata.py --help`

Exemplos:
`python3 scripts/extract_mdb_update_metadata.py`
`python3 scripts/extract_mdb_update_metadata.py --mdb RawData/Academxp_20250912.mdb --output Data/mdb_metadata.json`

## Lista Consolidada de Alunos

Script:
- `scripts/extract_alunos_lista.py`

Saídas:
- `Data/alunos_lista.json`
- `Data/logs/alunos_lista_extract_log.json`

Campos exportados:
- `reg_aluno` (formatado como `XXX/YYYY`)
- `sigla_curs`
- `status`
- `d_adimissa` (ISO `YYYY-MM-DD`)
- `d_final` (ISO `YYYY-MM-DD`, quando disponível)
- `d_situacao` (ISO `YYYY-MM-DD`, quando disponível)
- `nivel_cursoal`
- `nome`
- `nascimento` (ISO `YYYY-MM-DD`)
- `nacionalidade`
- `sexo`
- `estado`

Regras aplicadas:
- base de alunos em `CURSO_AL`, com chave única `REG_ALUNO`;
- exclui registros com `SIGLA_CURS`, `STATUS` ou `D_ADIMISSA` vazios/nulos;
- faz join com `GDRPESS` para trazer dados pessoais;
- registra no log totais de entrada, filtros aplicados, importação final e qualidade do join.

## Observações

Este README é uma primeira versão e pode ser expandido com:
- origem exata do MDB;
- procedimento de extração/transformação;
- convenções de nomes e pastas;
- validação de dados.
