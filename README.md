# DadosPGINPE

Repositório para armazenar dados extraídos de um arquivo MDB com informações da pós-graduação do INPE, publicados em uma página `github.io`.

Objetivo deste diretório:
- manter a versão local alinhada com o repositório oficial: `https://github.com/rafaeldcsantos/DadosPGINPE.git`;
- organizar dados brutos, processados e scripts de apoio;
- registrar um fluxo simples de atualização e versionamento.

## Estrutura inicial

- `NOPE/`: pasta local ignorada pelo Git (não versionada).
- `commit.sh`: script simples para adicionar e commitar mudanças.

## Fluxo básico

1. Atualizar ou adicionar arquivos de dados.
2. Revisar mudanças:
   `git status`
3. Criar commit com o script:
   `./commit.sh "mensagem do commit"`
4. Enviar para o remoto:
   `git push`

## Observações

Este README é uma primeira versão e pode ser expandido com:
- origem exata do MDB;
- procedimento de extração/transformação;
- convenções de nomes e pastas;
- validação de dados.
