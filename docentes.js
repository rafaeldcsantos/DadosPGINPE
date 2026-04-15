(function () {
  const statusEl = document.getElementById("docentes-status");
  const cardsRoot = document.getElementById("docentes-cards");

  const PLOTLY_CONFIG = {
    responsive: true,
    displayModeBar: false,
    displaylogo: false,
  };

  const KNOWN_PROGRAMS = [
    { code: "33010013010P4", sigla: "PGAST", color: "#8fc8ff" },
    { code: "33010013002P1", sigla: "PGCAP", color: "#ffd36f" },
    { code: "33010013011P0", sigla: "PGCST", color: "#7ee4b1" },
    { code: "33010013009P6", sigla: "PGETE", color: "#ff9fb3" },
    { code: "33010013008P0", sigla: "PGGES", color: "#c9a2ff" },
    { code: "33010013003P8", sigla: "PGMET", color: "#79d6ff" },
    { code: "33010013005P0", sigla: "PGSER", color: "#ffc48e" },
  ];
  const FALLBACK_COLORS = ["#7ec9ff", "#ffd36f", "#7ee4b1", "#ff9fb3", "#c9a2ff", "#79d6ff", "#ffc48e"];

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  async function loadPayload() {
    const response = await fetch("Data/inpe_docentes_por_ano_programa_colsucup.json", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        `Falha ao carregar Data/inpe_docentes_por_ano_programa_colsucup.json (HTTP ${response.status}).`
      );
    }
    return response.json();
  }

  function prepareRows(rawRows) {
    return rawRows
      .map((row) => {
        const year = Number(row.ano_base);
        return {
          year: Number.isFinite(year) ? String(year) : null,
          yearNumeric: year,
          programCode: String(row.cd_programa_ies || "").trim().toUpperCase(),
          programName: String(row.nm_programa_ies || "").trim(),
          count: Number(row.qtd_docentes_distintos),
        };
      })
      .filter((row) => Boolean(row.year))
      .filter((row) => Boolean(row.programCode))
      .filter((row) => Number.isFinite(row.count))
      .filter((row) => row.count >= 0);
  }

  function dataYearBounds(rows) {
    const years = rows
      .map((row) => row.yearNumeric)
      .filter((year) => Number.isFinite(year));
    if (!years.length) return null;
    return {
      min: Math.min(...years),
      max: Math.max(...years),
    };
  }

  function buildContinuousYearAxis(startYear, endYear) {
    const years = [];
    for (let year = startYear; year <= endYear; year += 1) {
      years.push(String(year));
    }
    return years;
  }

  function sparseTicks(years, maxTicks) {
    if (!Array.isArray(years) || years.length === 0) return [];
    if (years.length <= maxTicks) return years;

    const ticks = [];
    const step = Math.max(1, Math.ceil((years.length - 1) / (maxTicks - 1)));
    for (let i = 0; i < years.length; i += step) {
      ticks.push(years[i]);
    }
    const last = years[years.length - 1];
    if (ticks[ticks.length - 1] !== last) ticks.push(last);
    return ticks;
  }

  function buildProgramSpecs(rows) {
    const namesByCode = new Map();
    rows.forEach((row) => {
      if (!row.programCode) return;
      if (namesByCode.has(row.programCode)) return;
      namesByCode.set(row.programCode, row.programName || row.programCode);
    });

    const available = new Set(rows.map((row) => row.programCode));
    const specs = [];

    KNOWN_PROGRAMS.forEach((program) => {
      if (!available.has(program.code)) return;
      specs.push({
        ...program,
        programName: namesByCode.get(program.code) || program.code,
      });
    });

    const knownCodes = new Set(KNOWN_PROGRAMS.map((program) => program.code));
    const extraCodes = Array.from(available).filter((code) => !knownCodes.has(code)).sort();
    extraCodes.forEach((code, index) => {
      specs.push({
        code,
        sigla: code,
        color: FALLBACK_COLORS[index % FALLBACK_COLORS.length],
        programName: namesByCode.get(code) || code,
      });
    });

    return specs;
  }

  function buildYearSeries(rows, years, programSpecs) {
    const counter = new Map();
    rows.forEach((row) => {
      const key = `${row.year}|${row.programCode}`;
      counter.set(key, (counter.get(key) || 0) + row.count);
    });

    return programSpecs.map((program) => ({
      ...program,
      y: years.map((year) => counter.get(`${year}|${program.code}`) || 0),
    }));
  }

  function buildSingleProgramSeries(rows, years, programCode) {
    const byYear = new Map();
    rows
      .filter((row) => row.programCode === programCode)
      .forEach((row) => byYear.set(row.year, (byYear.get(row.year) || 0) + row.count));
    return years.map((year) => byYear.get(year) || 0);
  }

  function sharedProgramYAxisMax(rows, years, programSpecs) {
    let maxValue = 0;
    programSpecs.forEach((program) => {
      const series = buildSingleProgramSeries(rows, years, program.code);
      const localMax = Math.max(0, ...series);
      if (localMax > maxValue) maxValue = localMax;
    });

    if (maxValue <= 0) return 10;
    const padded = Math.ceil(maxValue * 1.08);
    return Math.max(10, Math.ceil(padded / 10) * 10);
  }

  function createCard(totalDocenteAno, totalRows, years, programCount, metricDescription) {
    const section = document.createElement("section");
    section.className = "stats-card";
    section.id = "card-docentes";

    section.innerHTML = `
      <div class="stats-card-head">
        <h2>Docentes por Ano - Todos os Programas</h2>
        <p>${metricDescription} Soma docente-ano: ${totalDocenteAno.toLocaleString("pt-BR")}. Pontos anuais programa-ano: ${totalRows.toLocaleString("pt-BR")}. Eixo anual: ${years[0]} a ${years[years.length - 1]}. Programas: ${programCount}.</p>
      </div>
      <div class="stats-card-grid">
        <div class="plot-panel plot-panel-large">
          <h3>Geral por Ano (Empilhado por Programa)</h3>
          <div id="docentes-geral-chart" class="plot-chart plot-chart-large"></div>
        </div>
        <div class="plot-panel">
          <h3>Por Programa (Miniaturas)</h3>
          <div id="docentes-mini-grid" class="mini-plots-grid"></div>
        </div>
      </div>
    `;

    return section;
  }

  function baseLayout({ legend }) {
    return {
      margin: { l: 48, r: 16, t: 18, b: legend ? 86 : 30 },
      paper_bgcolor: "#0d1727",
      plot_bgcolor: "#0d1727",
      font: { color: "#dbe7ff", family: "Sora, sans-serif" },
      bargap: 0.18,
      xaxis: {
        type: "category",
        tickangle: -45,
        gridcolor: "rgba(140,161,198,0.16)",
      },
      yaxis: {
        rangemode: "tozero",
        gridcolor: "rgba(140,161,198,0.2)",
      },
      showlegend: legend,
      legend: legend
        ? {
            orientation: "h",
            y: -0.24,
            x: 0,
            xanchor: "left",
            yanchor: "top",
            font: { size: 12 },
          }
        : undefined,
    };
  }

  function renderLargeChart(targetId, rows, years, programSpecs) {
    const series = buildYearSeries(rows, years, programSpecs);
    const traces = series.map((item) => ({
      type: "bar",
      name: item.sigla,
      x: years,
      y: item.y,
      marker: { color: item.color || "#9bb0ce" },
      hovertemplate:
        `${item.sigla} - ${item.programName}<br>Ano: %{x}<br>` +
        "Docentes: %{y}<extra></extra>",
    }));

    const layout = baseLayout({ legend: true });
    layout.barmode = "stack";
    Plotly.newPlot(targetId, traces, layout, PLOTLY_CONFIG);
  }

  function createMiniChartHolder(container, title, subtitle, chartId) {
    const item = document.createElement("div");
    item.className = "mini-plot-item";

    const heading = document.createElement("p");
    heading.className = "mini-plot-title";
    heading.textContent = title;
    heading.title = subtitle;

    const chart = document.createElement("div");
    chart.className = "mini-plot-chart";
    chart.id = chartId;

    item.appendChild(heading);
    item.appendChild(chart);
    container.appendChild(item);
  }

  function renderMiniCharts(gridId, rows, years, programSpecs) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = "";
    const sharedYMax = sharedProgramYAxisMax(rows, years, programSpecs);
    const miniTickVals = sparseTicks(years, 6);

    programSpecs.forEach((program) => {
      const chartId = `docentes-mini-${program.sigla.toLowerCase()}`;
      createMiniChartHolder(grid, program.sigla, program.programName, chartId);

      const y = buildSingleProgramSeries(rows, years, program.code);
      const trace = {
        type: "bar",
        x: years,
        y,
        marker: { color: program.color || "#9bb0ce" },
        hovertemplate:
          `${program.sigla} - ${program.programName}<br>Ano: %{x}<br>` +
          "Docentes: %{y}<extra></extra>",
      };
      const layout = baseLayout({ legend: false });
      layout.margin = { l: 28, r: 8, t: 8, b: 34 };
      layout.xaxis.tickfont = { size: 10 };
      layout.xaxis.tickangle = -35;
      layout.xaxis.tickmode = "array";
      layout.xaxis.tickvals = miniTickVals;
      layout.xaxis.ticktext = miniTickVals;
      layout.yaxis.tickfont = { size: 10 };
      layout.yaxis.tickmode = "linear";
      layout.yaxis.tick0 = 0;
      layout.yaxis.dtick = sharedYMax <= 30 ? 5 : 10;
      layout.yaxis.range = [0, sharedYMax];
      Plotly.newPlot(chartId, [trace], layout, PLOTLY_CONFIG);
    });
  }

  async function init() {
    if (typeof window.Plotly === "undefined") {
      throw new Error("Plotly não foi carregado.");
    }
    if (!cardsRoot) {
      throw new Error("Container de gráficos não encontrado.");
    }

    setStatus("Processando dados de docentes por ano...");
    const payload = await loadPayload();
    const rows = prepareRows(Array.isArray(payload?.records) ? payload.records : []);
    if (!rows.length) {
      throw new Error("Nenhum registro válido de docentes por ano foi encontrado.");
    }

    const bounds = dataYearBounds(rows);
    if (!bounds) {
      throw new Error("Não foi possível definir o eixo anual.");
    }
    const years = buildContinuousYearAxis(bounds.min, bounds.max);
    const programs = buildProgramSpecs(rows);
    if (!programs.length) {
      throw new Error("Nenhum programa encontrado nos dados de docentes.");
    }

    cardsRoot.innerHTML = "";

    const totalDocenteAno = rows.reduce((sum, row) => sum + row.count, 0);
    const metricDescription =
      "Métrica: docentes distintos por ano/programa (qtd_docentes_distintos).";
    const card = createCard(totalDocenteAno, rows.length, years, programs.length, metricDescription);
    cardsRoot.appendChild(card);

    renderLargeChart("docentes-geral-chart", rows, years, programs);
    renderMiniCharts("docentes-mini-grid", rows, years, programs);

    setStatus(
      `Exibindo ${rows.length.toLocaleString("pt-BR")} pontos anuais programa-ano, ` +
        `${programs.length} programas e série de ${bounds.min} a ${bounds.max}.`,
      false
    );
  }

  init().catch((error) => {
    console.error(error);
    setStatus(`Erro ao gerar painel de docentes: ${error.message}`, true);
  });
})();
