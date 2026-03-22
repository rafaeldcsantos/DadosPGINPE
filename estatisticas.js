(function () {
  const statusEl = document.getElementById("stats-status");

  const PLOTLY_CONFIG = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
  };

  const SEXO_ORDER = ["Feminino", "Masculino", "Não Informado"];
  const SEXO_COLORS = {
    Feminino: "#ff8fb6",
    Masculino: "#5cb8ff",
    "Não Informado": "#8fa2bf",
  };

  const NAC_ORDER = ["Brasileira", "Estrangeira", "Não Informada"];
  const NAC_COLORS = {
    Brasileira: "#66d68f",
    Estrangeira: "#ffc86a",
    "Não Informada": "#8fa2bf",
  };
  const EXCLUDED_PROGRAMS = new Set(["ISO"]);
  const PROGRAM_BREAKDOWN_ORDER = [
    "PGAST",
    "PGCAP",
    "PGCST",
    "PGETE",
    "PGGES",
    "PGMET",
    "PGSER",
  ];

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function normalizeCurso(value) {
    const text = String(value || "").trim().toUpperCase();
    return text || "N/D";
  }

  function normalizeSexo(value) {
    const text = normalizeText(value);
    if (!text) return "Não Informado";
    if (text.startsWith("f")) return "Feminino";
    if (text.startsWith("m") || text.includes("masc") || text.includes("macul")) {
      return "Masculino";
    }
    return "Não Informado";
  }

  function normalizeNacionalidade(value) {
    const text = normalizeText(value);
    if (text.includes("brasil")) return "Brasileira";
    if (text.includes("estrang")) return "Estrangeira";
    return "Não Informada";
  }

  function countByCategories(rows, categoryFn, order) {
    const counts = Object.fromEntries(order.map((k) => [k, 0]));
    rows.forEach((row) => {
      const key = categoryFn(row);
      if (!(key in counts)) counts[key] = 0;
      counts[key] += 1;
    });
    return counts;
  }

  function programCounts(rows) {
    const counts = new Map();
    rows.forEach((row) => {
      const curso = normalizeCurso(row.sigla_curs);
      if (EXCLUDED_PROGRAMS.has(curso)) return;
      counts.set(curso, (counts.get(curso) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }

  function programsForBreakdown(rows) {
    const available = new Set(programCounts(rows).map(([program]) => program));
    return PROGRAM_BREAKDOWN_ORDER.filter((program) => available.has(program));
  }

  function baseLayout(title, legend) {
    const hasTitle = Boolean(title && String(title).trim());
    return {
      title: hasTitle
        ? {
            text: title,
            font: { color: "#dbe7ff", size: 15 },
          }
        : undefined,
      margin: { l: 14, r: 14, t: hasTitle ? 40 : 12, b: legend ? 68 : 12 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: "#dbe7ff", family: "Sora, sans-serif" },
      uniformtext: { minsize: 11, mode: "hide" },
      showlegend: legend,
      legend: {
        orientation: "h",
        y: -0.12,
        x: 0,
        xanchor: "left",
        yanchor: "top",
        font: { size: 12 },
      },
    };
  }

  function renderDonut(targetId, counts, order, colors, options) {
    const labels = order.filter((label) => (counts[label] || 0) > 0);
    const values = labels.map((label) => counts[label] || 0);

    const data = [
      {
        type: "pie",
        labels,
        values,
        hole: options.hole ?? 0.58,
        sort: false,
        marker: {
          colors: labels.map((label) => colors[label] || "#9bb0ce"),
          line: { color: "#0b1420", width: 1 },
        },
        texttemplate: options.texttemplate ?? "%{label}<br>%{percent:.2%}",
        textposition: options.textposition ?? "auto",
        textfont: { size: options.textSize ?? 13 },
        hovertemplate: "%{label}: %{value} (%{percent:.2%})<extra></extra>",
      },
    ];

    const layout = baseLayout(options.title, options.legend);
    Plotly.newPlot(targetId, data, layout, PLOTLY_CONFIG);
  }

  function createMiniPlotItem(container, title, chartId) {
    const item = document.createElement("div");
    item.className = "mini-plot-item";

    const heading = document.createElement("p");
    heading.className = "mini-plot-title";
    heading.textContent = title;

    const chart = document.createElement("div");
    chart.className = "mini-plot-chart";
    chart.id = chartId;

    item.appendChild(heading);
    item.appendChild(chart);
    container.appendChild(item);
  }

  function renderMiniDonuts(containerId, rows, programs, categoryFn, order, colors, prefix) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    programs.forEach((program, idx) => {
      const subset = rows.filter((row) => normalizeCurso(row.sigla_curs) === program);
      const counts = countByCategories(subset, categoryFn, order);
      const total = subset.length;
      const chartId = `${prefix}-${idx}`;

      createMiniPlotItem(container, `${program} (${total})`, chartId);
      renderDonut(chartId, counts, order, colors, {
        title: "",
        legend: false,
        texttemplate: "%{percent:.2%}",
        textposition: "inside",
        textSize: 11,
        hole: 0.62,
      });
    });
  }

  async function loadRows() {
    const response = await fetch("Data/alunos_lista.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar Data/alunos_lista.json (HTTP ${response.status}).`);
    }
    const payload = await response.json();
    return Array.isArray(payload.records) ? payload.records : [];
  }

  async function init() {
    if (typeof window.Plotly === "undefined") {
      throw new Error("Plotly não foi carregado.");
    }

    setStatus("Gerando gráficos...");
    const rows = await loadRows();
    const selectedPrograms = programsForBreakdown(rows);

    const sexoCounts = countByCategories(rows, (row) => normalizeSexo(row.sexo), SEXO_ORDER);
    renderDonut("sexo-geral-chart", sexoCounts, SEXO_ORDER, SEXO_COLORS, {
      title: "",
      legend: true,
      texttemplate: "%{percent:.2%}",
      textposition: "inside",
      textSize: 16,
      hole: 0.56,
    });
    renderMiniDonuts(
      "sexo-programa-grid",
      rows,
      selectedPrograms,
      (row) => normalizeSexo(row.sexo),
      SEXO_ORDER,
      SEXO_COLORS,
      "sexo-programa"
    );

    const nacCounts = countByCategories(
      rows,
      (row) => normalizeNacionalidade(row.nacionalidade),
      NAC_ORDER
    );
    renderDonut("nac-geral-chart", nacCounts, NAC_ORDER, NAC_COLORS, {
      title: "",
      legend: true,
      texttemplate: "%{percent:.2%}",
      textposition: "inside",
      textSize: 16,
      hole: 0.56,
    });
    renderMiniDonuts(
      "nac-programa-grid",
      rows,
      selectedPrograms,
      (row) => normalizeNacionalidade(row.nacionalidade),
      NAC_ORDER,
      NAC_COLORS,
      "nac-programa"
    );

    setStatus(
      `Exibindo ${rows.length.toLocaleString("pt-BR")} alunos em 2 painéis. ` +
        `As visões por programa excluem ISO (disciplinas isoladas).`,
      false
    );
  }

  init().catch((error) => {
    console.error(error);
    setStatus(`Erro ao gerar estatísticas: ${error.message}`, true);
  });
})();
