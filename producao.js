(function () {
  const statusEl = document.getElementById("producao-status");
  const summaryEl = document.getElementById("producao-resumo");
  const chartComAmbosEl = document.getElementById("producao-chart");
  const miniGridEl = document.getElementById("producao-mini-grid");

  const PLOTLY_CONFIG_BASE = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
  };

  const PROGRAM_SPECS = [
    { code: "33010013010P4", sigla: "PGAST", color: "#8fc8ff" },
    { code: "33010013002P1", sigla: "PGCAP", color: "#ffd36f" },
    { code: "33010013011P0", sigla: "PGCST", color: "#7ee4b1" },
    { code: "33010013009P6", sigla: "PGETE", color: "#ff9fb3" },
    { code: "33010013008P0", sigla: "PGGES", color: "#c9a2ff" },
    { code: "33010013003P8", sigla: "PGMET", color: "#79d6ff" },
    { code: "33010013005P0", sigla: "PGSER", color: "#ffc48e" },
  ];
  const PROGRAM_FALLBACK_COLORS = [
    "#7ec9ff",
    "#ffd36f",
    "#7ee4b1",
    "#ff9fb3",
    "#c9a2ff",
    "#79d6ff",
    "#ffc48e",
    "#9bb0ce",
  ];

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function setSummary(message) {
    if (!summaryEl) return;
    summaryEl.textContent = message;
  }

  async function loadCsvText() {
    const response = await fetch(
      "Data/inpe_artpe_autores_por_artigo_2013_2024_glosa0_simplificado_flags.csv",
      { cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error(
        `Falha ao carregar Data/inpe_artpe_autores_por_artigo_2013_2024_glosa0_simplificado_flags.csv (HTTP ${response.status}).`
      );
    }
    return response.text();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        continue;
      }

      if (char === ",") {
        row.push(field);
        field = "";
        continue;
      }

      if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        continue;
      }

      if (char === "\r") continue;
      field += char;
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function csvRowsToRecords(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map((header) => String(header || "").trim());
    return rows
      .slice(1)
      .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
      .map((row) => {
        const record = {};
        headers.forEach((header, index) => {
          record[header] = String(row[index] || "").trim();
        });
        return record;
      });
  }

  function parseBoolean(value) {
    return String(value || "").trim().toLowerCase() === "true";
  }

  function parseYear(value) {
    const text = String(value || "").trim();
    const year = Number(text);
    if (Number.isFinite(year) && year >= 1900 && year <= 2100) {
      return Math.trunc(year);
    }
    return null;
  }

  function prepareRows(records) {
    return records
      .map((row) => ({
        year: parseYear(row.an_base),
        comEgressosOuDiscentes: parseBoolean(
          row.com_egressos_ou_discentes || row.com_ambos
        ),
        programCode: String(row.cd_programa_ies || "").trim().toUpperCase(),
      }))
      .filter((row) => Number.isFinite(row.year))
      .filter((row) => row.programCode !== "");
  }

  function buildYearAxis(rows) {
    const years = rows.map((row) => row.year);
    if (!years.length) return [];
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const axis = [];
    for (let year = minYear; year <= maxYear; year += 1) {
      axis.push(String(year));
    }
    return axis;
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

  function aggregateByYear(rows, yearAxis) {
    const withFlagByYear = new Map();
    const withoutFlagByYear = new Map();

    rows.forEach((row) => {
      const key = String(row.year);
      if (row.comEgressosOuDiscentes) {
        withFlagByYear.set(key, (withFlagByYear.get(key) || 0) + 1);
      } else {
        withoutFlagByYear.set(key, (withoutFlagByYear.get(key) || 0) + 1);
      }
    });

    return {
      withFlag: yearAxis.map((year) => withFlagByYear.get(year) || 0),
      withoutFlag: yearAxis.map((year) => withoutFlagByYear.get(year) || 0),
    };
  }

  function buildProgramCatalog(rows) {
    const availableCodes = new Set(rows.map((row) => row.programCode));
    const catalog = [];

    PROGRAM_SPECS.forEach((program) => {
      if (!availableCodes.has(program.code)) return;
      catalog.push(program);
    });

    const knownCodes = new Set(PROGRAM_SPECS.map((program) => program.code));
    const extraCodes = Array.from(availableCodes)
      .filter((code) => !knownCodes.has(code))
      .sort();

    extraCodes.forEach((code, index) => {
      catalog.push({
        code,
        sigla: code,
        color: PROGRAM_FALLBACK_COLORS[index % PROGRAM_FALLBACK_COLORS.length],
      });
    });

    return catalog;
  }

  function buildProgramFlagSeries(rows, yearAxis, programCode) {
    const byYearWith = new Map();
    const byYearWithout = new Map();

    rows
      .filter((row) => row.programCode === programCode)
      .forEach((row) => {
        const key = String(row.year);
        if (row.comEgressosOuDiscentes) {
          byYearWith.set(key, (byYearWith.get(key) || 0) + 1);
        } else {
          byYearWithout.set(key, (byYearWithout.get(key) || 0) + 1);
        }
      });

    const yWith = yearAxis.map((year) => byYearWith.get(year) || 0);
    const yWithout = yearAxis.map((year) => byYearWithout.get(year) || 0);
    const yTotal = yearAxis.map((_, i) => yWith[i] + yWithout[i]);

    return { yWith, yWithout, yTotal };
  }

  function sharedProgramYAxisMax(rows, yearAxis, programCatalog) {
    let maxValue = 0;
    programCatalog.forEach((program) => {
      const series = buildProgramFlagSeries(rows, yearAxis, program.code);
      const localMax = Math.max(0, ...series.yTotal);
      if (localMax > maxValue) maxValue = localMax;
    });
    if (maxValue <= 0) return 10;
    const padded = Math.ceil(maxValue * 1.08);
    return Math.max(10, Math.ceil(padded / 10) * 10);
  }

  function hexToRgb(hex) {
    const text = String(hex || "").trim();
    const match = text.match(/^#([0-9a-f]{6})$/i);
    if (!match) return null;
    const value = match[1];
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
    };
  }

  function rgbToHex(r, g, b) {
    const toHex = (value) => value.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function blendColors(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a || !b) return hexA;

    const mix = (v1, v2) => Math.round(v1 * (1 - t) + v2 * t);
    return rgbToHex(mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b));
  }

  function lightenColor(hex, factor) {
    const rgb = hexToRgb(hex);
    if (!rgb) return "#c8d5e8";
    const blend = (value) =>
      Math.max(0, Math.min(255, Math.round(value + (255 - value) * factor)));
    return rgbToHex(blend(rgb.r), blend(rgb.g), blend(rgb.b));
  }

  function plotConfig(filename) {
    return {
      ...PLOTLY_CONFIG_BASE,
      toImageButtonOptions: {
        format: "png",
        filename,
        scale: 2,
      },
      modeBarButtonsToRemove: ["lasso2d", "select2d", "toggleSpikelines", "autoScale2d"],
    };
  }

  function baseLayout({ legend }) {
    return {
      margin: { l: 48, r: 16, t: 18, b: legend ? 86 : 30 },
      paper_bgcolor: "#0d1727",
      plot_bgcolor: "#0d1727",
      font: { color: "#dbe7ff", family: "Sora, sans-serif" },
      barmode: "stack",
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

  function renderOverallChart(yearAxis, aggregated) {
    if (!chartComAmbosEl) return;
    const percent = buildPercentLabels(aggregated.withFlag, aggregated.withoutFlag);
    const maxTotal = Math.max(0, ...percent.totals);
    const textY = percent.totals.map((total) => total + maxTotal * 0.03);

    const traces = [
      {
        type: "bar",
        name: "Com egressos ou discentes",
        x: yearAxis,
        y: aggregated.withFlag,
        marker: { color: "#4ec9f5" },
        hovertemplate:
          "Ano: %{x}<br>Artigos com egressos/discentes: %{y}<extra></extra>",
      },
      {
        type: "bar",
        name: "Sem egressos ou discentes",
        x: yearAxis,
        y: aggregated.withoutFlag,
        marker: { color: "#889ab8" },
        hovertemplate:
          "Ano: %{x}<br>Artigos sem egressos/discentes: %{y}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "text",
        showlegend: false,
        hoverinfo: "skip",
        x: yearAxis,
        y: textY,
        text: percent.labels,
        textposition: "top center",
        textfont: { size: 12, color: "#dbe7ff" },
        cliponaxis: false,
      },
    ];

    const layout = baseLayout({ legend: true });
    if (maxTotal > 0) {
      layout.yaxis.range = [0, maxTotal * 1.15];
    }

    window.Plotly.newPlot(
      chartComAmbosEl,
      traces,
      layout,
      plotConfig("dadospginpe_producao_com_egressos_ou_discentes")
    );
  }

  function createMiniChartHolder(container, title, chartId) {
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

  function renderProgramCharts(yearAxis, rows, programCatalog) {
    if (!miniGridEl) return;
    miniGridEl.innerHTML = "";
    const sharedYMax = sharedProgramYAxisMax(rows, yearAxis, programCatalog);
    const miniTickVals = sparseTicks(yearAxis, 6);

    programCatalog.forEach((program) => {
      const chartId = `producao-mini-${program.sigla.toLowerCase()}`;
      createMiniChartHolder(miniGridEl, program.sigla, chartId);

      const series = buildProgramFlagSeries(rows, yearAxis, program.code);
      const baseColor = program.color || "#9bb0ce";
      // Tons mais suaves para reduzir saturação visual nos mini gráficos.
      const colorFalse = blendColors(baseColor, "#dbe7ff", 0.42);
      const colorTrue = lightenColor(blendColors(baseColor, "#eaf2ff", 0.55), 0.22);
      const percent = buildPercentLabels(series.yWith, series.yWithout);
      const textY = percent.totals.map((total) => total + sharedYMax * 0.02);

      const traces = [
        {
          type: "bar",
          name: "Sem egressos ou discentes",
          x: yearAxis,
          y: series.yWithout,
          marker: { color: colorFalse },
          hovertemplate:
            `${program.sigla}<br>Ano: %{x}<br>com_egressos_ou_discentes=false: %{y}<extra></extra>`,
        },
        {
          type: "bar",
          name: "Com egressos ou discentes",
          x: yearAxis,
          y: series.yWith,
          marker: { color: colorTrue },
          hovertemplate:
            `${program.sigla}<br>Ano: %{x}<br>com_egressos_ou_discentes=true: %{y}<extra></extra>`,
        },
        {
          type: "scatter",
          mode: "text",
          showlegend: false,
          hoverinfo: "skip",
          x: yearAxis,
          y: textY,
          text: percent.labels,
          textposition: "top center",
          textfont: { size: 9, color: "#dbe7ff" },
          cliponaxis: false,
        },
      ];

      const layout = baseLayout({ legend: false });
      layout.margin = { l: 28, r: 8, t: 14, b: 34 };
      layout.xaxis.tickfont = { size: 10 };
      layout.xaxis.tickangle = -35;
      layout.xaxis.tickmode = "array";
      layout.xaxis.tickvals = miniTickVals;
      layout.xaxis.ticktext = miniTickVals;
      layout.yaxis.tickfont = { size: 10 };
      layout.yaxis.tickmode = "linear";
      layout.yaxis.tick0 = 0;
      layout.yaxis.dtick = sharedYMax <= 30 ? 5 : 10;
      layout.yaxis.range = [0, sharedYMax * 1.12];

      window.Plotly.newPlot(
        chartId,
        traces,
        layout,
        plotConfig(`dadospginpe_producao_${program.sigla.toLowerCase()}`)
      );
    });
  }

  function sum(array) {
    return array.reduce((acc, value) => acc + Number(value || 0), 0);
  }

  function buildPercentLabels(withValues, withoutValues) {
    const totals = withValues.map(
      (value, index) => Number(value || 0) + Number(withoutValues[index] || 0)
    );
    const labels = totals.map((total, index) => {
      if (!total) return "";
      const pct = (100 * Number(withValues[index] || 0)) / total;
      return `${pct.toFixed(2)}%`;
    });
    return { totals, labels };
  }

  async function init() {
    if (typeof window.Plotly === "undefined") {
      throw new Error("Plotly não foi carregado.");
    }
    if (!chartComAmbosEl || !miniGridEl) {
      throw new Error("Container do gráfico não encontrado.");
    }

    setStatus("Carregando e agregando artigos por ano...");
    const text = await loadCsvText();
    const records = csvRowsToRecords(parseCsv(text));
    const rows = prepareRows(records);
    if (!rows.length) {
      throw new Error("Nenhum registro válido encontrado no CSV simplificado.");
    }

    const yearAxis = buildYearAxis(rows);
    if (!yearAxis.length) {
      throw new Error("Não foi possível montar o eixo anual.");
    }

    const aggregated = aggregateByYear(rows, yearAxis);
    const programCatalog = buildProgramCatalog(rows);

    renderOverallChart(yearAxis, aggregated);
    renderProgramCharts(yearAxis, rows, programCatalog);

    const totalWithFlag = sum(aggregated.withFlag);
    const totalWithoutFlag = sum(aggregated.withoutFlag);
    const total = totalWithFlag + totalWithoutFlag;
    const shareWithFlag = total > 0 ? (100 * totalWithFlag) / total : 0;

    setSummary(
      `Total de artigos: ${total.toLocaleString("pt-BR")}. ` +
        `Com discentes/egressos: ${totalWithFlag.toLocaleString("pt-BR")} ` +
        `(${shareWithFlag.toFixed(1)}%). ` +
        `Sem discentes/egressos: ${totalWithoutFlag.toLocaleString("pt-BR")}. ` +
        `Painéis por programa: ${programCatalog.length}.`
    );

    setStatus(
      `Exibindo ${total.toLocaleString("pt-BR")} artigos entre ${yearAxis[0]} e ${yearAxis[yearAxis.length - 1]}. ` +
        `Use o ícone de câmera para baixar PNG.`,
      false
    );
  }

  init().catch((error) => {
    console.error(error);
    setStatus(`Erro ao carregar produção: ${error.message}`, true);
    setSummary("Resumo indisponível.");
  });
})();
