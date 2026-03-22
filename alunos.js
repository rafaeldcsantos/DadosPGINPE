(function () {
  const tableTarget = document.getElementById("alunos-table");
  if (!tableTarget) return;

  const statusEl = document.getElementById("alunos-status");
  const searchInput = document.getElementById("alunos-global-filter");
  const clearButton = document.getElementById("alunos-clear-filters");

  const SEARCH_FIELDS = [
    "reg_aluno",
    "nome",
    "nascimento",
    "sexo",
    "sigla_curs",
    "status",
    "d_adimissa",
    "nivel_cursoal",
  ];

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function regToParts(value) {
    const match = /^(\d+)\/(\d{4})$/.exec(String(value || ""));
    if (!match) return { ano: -1, seq: -1 };
    return {
      ano: Number(match[2]),
      seq: Number(match[1]),
    };
  }

  function regSorter(a, b) {
    const left = regToParts(a);
    const right = regToParts(b);
    if (left.ano !== right.ano) return left.ano - right.ano;
    return left.seq - right.seq;
  }

  function isoDateSorter(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return String(a).localeCompare(String(b));
  }

  function formatIsoDate(value) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("pt-BR").format(date);
  }

  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value).toLowerCase();
  }

  function applyGlobalFilter(table, term) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) {
      table.clearFilter(false);
      return;
    }

    table.setFilter((rowData) =>
      SEARCH_FIELDS.some((field) => normalizeText(rowData[field]).includes(normalizedTerm))
    );
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar ${path} (HTTP ${response.status}).`);
    }
    return response.json();
  }

  function buildStatusMessage(dataset, logData) {
    const imported = Number(dataset?.record_count || 0).toLocaleString("pt-BR");

    const cursoLog = logData?.curso_al;
    if (!cursoLog) {
      return `Exibindo ${imported} alunos válidos de ${imported}.`;
    }

    const totalCursoAl = Number(cursoLog.records_total || 0).toLocaleString("pt-BR");
    return `Exibindo ${imported} alunos válidos de ${totalCursoAl}.`;
  }

  async function initTable() {
    if (typeof window.Tabulator !== "function") {
      setStatus("Erro: biblioteca Tabulator não foi carregada.", true);
      return;
    }

    setStatus("Carregando dados de alunos...");

    const [dataset, logData] = await Promise.all([
      fetchJson("Data/alunos_lista.json"),
      fetchJson("Data/logs/alunos_lista_extract_log.json").catch(() => null),
    ]);

    const rows = Array.isArray(dataset.records) ? dataset.records : [];

    const table = new Tabulator(tableTarget, {
      data: rows,
      layout: "fitDataStretch",
      locale: "pt-br",
      langs: {
        "pt-br": {
          pagination: {
            page_size: "Linhas por página",
            page_title: "Página",
            first: "Primeira",
            first_title: "Primeira página",
            last: "Última",
            last_title: "Última página",
            prev: "Anterior",
            prev_title: "Página anterior",
            next: "Próxima",
            next_title: "Próxima página",
            all: "Todas",
            counter: {
              showing: "Mostrando",
              of: "de",
              rows: "linhas",
              pages: "páginas",
            },
          },
        },
      },
      responsiveLayout: "collapse",
      placeholder: "Nenhum registro encontrado.",
      pagination: true,
      paginationSize: 25,
      paginationSizeSelector: [25, 50, 100, 250],
      paginationCounter: "rows",
      initialSort: [{ column: "d_adimissa", dir: "desc" }],
      columns: [
        {
          title: "REG_ALUNO",
          field: "reg_aluno",
          sorter: regSorter,
          headerFilter: "input",
          hozAlign: "center",
          width: 132,
        },
        {
          title: "NOME",
          field: "nome",
          sorter: "string",
          headerFilter: "input",
          minWidth: 260,
        },
        {
          title: "NASCIMENTO",
          field: "nascimento",
          sorter: isoDateSorter,
          formatter: (cell) => formatIsoDate(cell.getValue()),
          headerFilter: "input",
          hozAlign: "center",
          width: 142,
        },
        {
          title: "SEXO",
          field: "sexo",
          sorter: "string",
          headerFilter: "input",
          width: 110,
        },
        {
          title: "CURSO",
          field: "sigla_curs",
          sorter: "string",
          headerFilter: "input",
          hozAlign: "center",
          width: 118,
        },
        {
          title: "STATUS",
          field: "status",
          sorter: "string",
          headerFilter: "input",
          width: 130,
        },
        {
          title: "ADMISSÃO",
          field: "d_adimissa",
          sorter: isoDateSorter,
          formatter: (cell) => formatIsoDate(cell.getValue()),
          headerFilter: "input",
          hozAlign: "center",
          width: 138,
        },
        {
          title: "NÍVEL",
          field: "nivel_cursoal",
          sorter: "string",
          headerFilter: "input",
          width: 130,
        },
      ],
    });

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        applyGlobalFilter(table, searchInput.value);
      });
    }

    if (clearButton) {
      clearButton.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        table.clearFilter(true);
      });
    }

    setStatus(buildStatusMessage(dataset, logData), false);
  }

  initTable().catch((error) => {
    console.error(error);
    setStatus(`Erro ao montar tabela: ${error.message}`, true);
  });
})();
