(function () {
  const statusEl = document.getElementById("formados-status");
  const cardsRoot = document.getElementById("formados-cards");

  const PLOTLY_CONFIG = {
    responsive: true,
    displayModeBar: false,
    displaylogo: false,
  };

  const PROGRAM_ORDER = ["PGAST", "PGCAP", "PGCST", "PGETE", "PGGES", "PGMET", "PGSER"];
  const PROGRAM_COLORS = {
    PGAST: "#8fc8ff",
    PGCAP: "#ffd36f",
    PGCST: "#7ee4b1",
    PGETE: "#ff9fb3",
    PGGES: "#c9a2ff",
    PGMET: "#79d6ff",
    PGSER: "#ffc48e",
  };
  const LEVEL_ORDER = ["Mestrado", "Doutorado"];
  const LEVEL_COLORS = {
    Mestrado: "#4ec9f5",
    Doutorado: "#ff9f6a",
  };
  const MATRIX_LAST_YEARS = 12;
  const TARGET_STATUS = "Concluído";
  const CONCLUSION_DATE_LABEL = "D_FINAL ou D_SITUAÇÃO";

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

  function normalizeProgram(value) {
    return String(value || "").trim().toUpperCase();
  }

  function normalizeLevel(value) {
    const text = normalizeText(value);
    if (text.startsWith("mestr")) return "Mestrado";
    if (text.startsWith("dout")) return "Doutorado";
    return null;
  }

  function extractYear(value) {
    const text = String(value || "").trim();
    const match = text.match(/(19|20)\d{2}/);
    return match ? match[0] : null;
  }

  async function loadRows() {
    const response = await fetch("Data/alunos_lista.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar Data/alunos_lista.json (HTTP ${response.status}).`);
    }
    const payload = await response.json();
    return Array.isArray(payload.records) ? payload.records : [];
  }

  async function loadMdbCurrentYear() {
    try {
      const response = await fetch("Data/mdb_metadata.json", { cache: "no-store" });
      if (!response.ok) return null;
      const metadata = await response.json();

      const candidates = [
        metadata?.msysobjects?.latest_object_dateupdate,
        metadata?.source_filename_date,
        metadata?.source_file_modified_utc,
        metadata?.generated_at_utc,
      ];
      for (const candidate of candidates) {
        const year = extractYear(candidate);
        if (year) return Number(year);
      }
      return null;
    } catch (_error) {
      return null;
    }
  }

  function conclusionYearFromRow(row) {
    return extractYear(row.d_final) || extractYear(row.d_situacao);
  }

  function prepareRows(rawRows) {
    const stats = {
      raw_total: rawRows.length,
      status_concluido: 0,
      non_iso: 0,
      recognized_program: 0,
      valid_level: 0,
      with_conclusion_date: 0,
      without_conclusion_date: 0,
    };

    const rows = rawRows
      .filter((row) => {
        const keep = normalizeText(row.status) === "concluido";
        if (keep) stats.status_concluido += 1;
        return keep;
      })
      .map((row) => {
        const program = normalizeProgram(row.sigla_curs);
        const level = normalizeLevel(row.nivel_cursoal);
        const year = conclusionYearFromRow(row);
        return {
          program,
          level,
          year,
        };
      })
      .filter((row) => {
        const keep = row.program !== "ISO";
        if (keep) stats.non_iso += 1;
        return keep;
      })
      .filter((row) => {
        const keep = PROGRAM_ORDER.includes(row.program);
        if (keep) stats.recognized_program += 1;
        return keep;
      })
      .filter((row) => {
        const keep = Boolean(row.level);
        if (keep) stats.valid_level += 1;
        return keep;
      })
      .filter((row) => {
        const keep = Boolean(row.year);
        if (keep) {
          stats.with_conclusion_date += 1;
        } else {
          stats.without_conclusion_date += 1;
        }
        return keep;
      });

    return { rows, stats };
  }

  function buildYearSeries(rows, yearList) {
    const counter = new Map();
    rows.forEach((row) => {
      const key = `${row.year}|${row.program}`;
      counter.set(key, (counter.get(key) || 0) + 1);
    });

    return PROGRAM_ORDER.map((program) => ({
      program,
      y: yearList.map((year) => counter.get(`${year}|${program}`) || 0),
    }));
  }

  function buildSingleProgramSeries(rows, yearList, program) {
    const byYear = new Map();
    rows
      .filter((row) => row.program === program)
      .forEach((row) => byYear.set(row.year, (byYear.get(row.year) || 0) + 1));
    return yearList.map((year) => byYear.get(year) || 0);
  }

  function sharedProgramYAxisMax(rows, yearList) {
    let maxValue = 0;
    PROGRAM_ORDER.forEach((program) => {
      const series = buildSingleProgramSeries(rows, yearList, program);
      const localMax = Math.max(0, ...series);
      if (localMax > maxValue) maxValue = localMax;
    });

    if (maxValue <= 0) return 20;
    const padded = Math.ceil(maxValue * 1.08);
    return Math.max(20, Math.ceil(padded / 20) * 20);
  }

  function buildLevelSeries(rows, yearList) {
    const counter = new Map();
    rows.forEach((row) => {
      const key = `${row.year}|${row.level}`;
      counter.set(key, (counter.get(key) || 0) + 1);
    });

    return LEVEL_ORDER.map((level) => ({
      level,
      y: yearList.map((year) => counter.get(`${year}|${level}`) || 0),
    }));
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

  function createCard(level, total, cardIndex) {
    const section = document.createElement("section");
    section.className = "stats-card";
    section.id = `card-formados-${cardIndex}`;

    section.innerHTML = `
      <div class="stats-card-head">
        <h2>Formados por Ano de Conclusão - ${level}</h2>
        <p>Registros com status ${TARGET_STATUS} e data de conclusão neste nível: ${total.toLocaleString("pt-BR")}.</p>
      </div>
      <div class="stats-card-grid">
        <div class="plot-panel plot-panel-large">
          <h3>Geral por Ano de Conclusão (Empilhado por Programa)</h3>
          <div id="formados-geral-${cardIndex}" class="plot-chart plot-chart-large"></div>
        </div>
        <div class="plot-panel">
          <h3>Por Programa (7)</h3>
          <div id="formados-mini-grid-${cardIndex}" class="mini-plots-grid"></div>
        </div>
      </div>
    `;

    return section;
  }

  function createAllProgramsCard(total) {
    const section = document.createElement("section");
    section.className = "stats-card";
    section.id = "card-formados-geral-niveis";

    section.innerHTML = `
      <div class="stats-card-head">
        <h2>Formados por Ano de Conclusão - Todos os Programas</h2>
        <p>Registros com status ${TARGET_STATUS}, ISO excluído, com data de conclusão: ${total.toLocaleString("pt-BR")}.</p>
      </div>
      <div class="stats-card-grid">
        <div class="plot-panel plot-panel-large">
          <h3>Geral por Ano de Conclusão (Empilhado por Nível)</h3>
          <div id="formados-geral-niveis-chart" class="plot-chart plot-chart-large"></div>
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

  function renderLargeChart(targetId, rows, years) {
    const series = buildYearSeries(rows, years);
    const traces = series.map((item) => ({
      type: "bar",
      name: item.program,
      x: years,
      y: item.y,
      marker: { color: PROGRAM_COLORS[item.program] || "#9bb0ce" },
      hovertemplate: `${item.program}<br>Ano: %{x}<br>Concluídos: %{y}<extra></extra>`,
    }));

    const layout = baseLayout({ legend: true });
    layout.barmode = "stack";
    Plotly.newPlot(targetId, traces, layout, PLOTLY_CONFIG);
  }

  function renderAllProgramsByLevelChart(targetId, rows, years) {
    const series = buildLevelSeries(rows, years);
    const traces = series.map((item) => ({
      type: "bar",
      name: item.level,
      x: years,
      y: item.y,
      marker: { color: LEVEL_COLORS[item.level] || "#9bb0ce" },
      hovertemplate: `${item.level}<br>Ano: %{x}<br>Concluídos: %{y}<extra></extra>`,
    }));

    const layout = baseLayout({ legend: true });
    layout.barmode = "stack";
    Plotly.newPlot(targetId, traces, layout, PLOTLY_CONFIG);
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

  function renderMiniCharts(gridId, rows, years, cardIndex) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = "";
    const sharedYMax = sharedProgramYAxisMax(rows, years);

    PROGRAM_ORDER.forEach((program) => {
      const chartId = `formados-mini-${cardIndex}-${program.toLowerCase()}`;
      createMiniChartHolder(grid, program, chartId);

      const y = buildSingleProgramSeries(rows, years, program);
      const trace = {
        type: "bar",
        x: years,
        y,
        marker: { color: PROGRAM_COLORS[program] || "#9bb0ce" },
        hovertemplate: `${program}<br>Ano: %{x}<br>Concluídos: %{y}<extra></extra>`,
      };
      const layout = baseLayout({ legend: false });
      layout.margin = { l: 28, r: 8, t: 8, b: 34 };
      layout.xaxis.tickfont = { size: 10 };
      layout.xaxis.tickangle = -35;
      const miniTickVals = sparseTicks(years, 6);
      layout.xaxis.tickmode = "array";
      layout.xaxis.tickvals = miniTickVals;
      layout.xaxis.ticktext = miniTickVals;
      layout.yaxis.tickfont = { size: 10 };
      layout.yaxis.tickmode = "linear";
      layout.yaxis.tick0 = 0;
      layout.yaxis.dtick = 20;
      layout.yaxis.range = [0, sharedYMax];
      Plotly.newPlot(chartId, [trace], layout, PLOTLY_CONFIG);
    });
  }

  function levelsFromRows(rows) {
    const available = new Set(rows.map((row) => row.level));
    return LEVEL_ORDER.filter((level) => available.has(level));
  }

  function dataYearBounds(rows) {
    const numericYears = rows
      .map((row) => Number(row.year))
      .filter((year) => Number.isFinite(year));
    if (!numericYears.length) return null;
    return {
      min: Math.min(...numericYears),
      max: Math.max(...numericYears),
    };
  }

  function buildContinuousYearAxis(startYear, endYear) {
    const years = [];
    for (let year = startYear; year <= endYear; year += 1) {
      years.push(String(year));
    }
    return years;
  }

  function buildLastNYearsAxis(endYear, count) {
    const startYear = endYear - count + 1;
    const years = [];
    for (let year = startYear; year <= endYear; year += 1) {
      years.push(String(year));
    }
    return years;
  }

  function buildProgramYearLevelCounts(rows) {
    const counts = {};
    rows.forEach((row) => {
      const program = row.program;
      const year = row.year;
      const level = row.level;

      if (!counts[program]) counts[program] = {};
      if (!counts[program][year]) {
        counts[program][year] = { Mestrado: 0, Doutorado: 0 };
      }
      if (level === "Mestrado" || level === "Doutorado") {
        counts[program][year][level] += 1;
      }
    });
    return counts;
  }

  function buildProgramLevelTotals(rows) {
    const totals = {};
    PROGRAM_ORDER.forEach((program) => {
      totals[program] = { Mestrado: 0, Doutorado: 0, Total: 0 };
    });

    rows.forEach((row) => {
      const program = row.program;
      const level = row.level;
      if (!PROGRAM_ORDER.includes(program)) return;
      if (level !== "Mestrado" && level !== "Doutorado") return;

      totals[program][level] += 1;
      totals[program].Total += 1;
    });

    return totals;
  }

  function buildYearLevelTotals(rows, years) {
    const totals = {};
    years.forEach((year) => {
      totals[year] = { Mestrado: 0, Doutorado: 0 };
    });

    rows.forEach((row) => {
      const year = row.year;
      const level = row.level;
      if (!totals[year]) return;
      if (level !== "Mestrado" && level !== "Doutorado") return;
      totals[year][level] += 1;
    });

    return totals;
  }

  function createProgramTotalsCard(rows) {
    const totals = buildProgramLevelTotals(rows);
    const grand = { Mestrado: 0, Doutorado: 0, Total: 0 };

    const bodyRowsHtml = PROGRAM_ORDER.map((program) => {
      const mestrado = totals[program].Mestrado;
      const doutorado = totals[program].Doutorado;
      const total = totals[program].Total;

      grand.Mestrado += mestrado;
      grand.Doutorado += doutorado;
      grand.Total += total;

      return `
        <tr>
          <th scope="row" class="admissao-matrix-program">${program}</th>
          <td class="admissao-matrix-cell">${mestrado.toLocaleString("pt-BR")}</td>
          <td class="admissao-matrix-cell">${doutorado.toLocaleString("pt-BR")}</td>
          <td class="admissao-matrix-cell">${total.toLocaleString("pt-BR")}</td>
        </tr>
      `;
    }).join("");

    const section = document.createElement("section");
    section.className = "stats-card";
    section.id = "card-formados-resumo-programa";
    section.innerHTML = `
      <div class="stats-card-head">
        <h2>Resumo de Formados por Programa e Nível</h2>
        <p>Totais consolidados de concluintes por programa, separados em Mestrado e Doutorado.</p>
      </div>
      <div class="admissao-matrix-wrap">
        <table class="admissao-matrix" aria-label="Tabela resumo de formados por programa e nível">
          <thead>
            <tr>
              <th scope="col" class="admissao-matrix-program">Programa</th>
              <th scope="col">Mestrado</th>
              <th scope="col">Doutorado</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRowsHtml}
            <tr>
              <th scope="row" class="admissao-matrix-program">Total Geral</th>
              <td class="admissao-matrix-cell">${grand.Mestrado.toLocaleString("pt-BR")}</td>
              <td class="admissao-matrix-cell">${grand.Doutorado.toLocaleString("pt-BR")}</td>
              <td class="admissao-matrix-cell">${grand.Total.toLocaleString("pt-BR")}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    return section;
  }

  function createYearCumulativeTotalsCard(rows, years) {
    const totalsByYear = buildYearLevelTotals(rows, years);
    let acumulado = 0;

    const bodyRowsHtml = years
      .map((year) => {
        const mestrado = totalsByYear[year]?.Mestrado || 0;
        const doutorado = totalsByYear[year]?.Doutorado || 0;
        const totalAno = mestrado + doutorado;
        acumulado += totalAno;

        return `
          <tr>
            <th scope="row" class="admissao-matrix-program">${year}</th>
            <td class="admissao-matrix-cell">${mestrado.toLocaleString("pt-BR")}</td>
            <td class="admissao-matrix-cell">${doutorado.toLocaleString("pt-BR")}</td>
            <td class="admissao-matrix-cell">${totalAno.toLocaleString("pt-BR")}</td>
            <td class="admissao-matrix-cell">${acumulado.toLocaleString("pt-BR")}</td>
          </tr>
        `;
      })
      .join("");

    const section = document.createElement("section");
    section.className = "stats-card";
    section.id = "card-formados-acumulado-anual";
    section.innerHTML = `
      <div class="stats-card-head">
        <h2>Total de Formados por Ano (M+D Acumulado)</h2>
        <p>Totais anuais de Mestrado e Doutorado, sem separação por programa, com acumulado de M+D.</p>
      </div>
      <div class="admissao-matrix-wrap">
        <table class="admissao-matrix" aria-label="Tabela anual de formados com acumulado M mais D">
          <thead>
            <tr>
              <th scope="col" class="admissao-matrix-program">Ano</th>
              <th scope="col">Mestrado</th>
              <th scope="col">Doutorado</th>
              <th scope="col">M + D (Ano)</th>
              <th scope="col">M + D Acumulado</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRowsHtml}
          </tbody>
        </table>
      </div>
    `;
    return section;
  }

  function cellValueHtml(mestrado, doutorado) {
    const total = mestrado + doutorado;
    if (total === 0) return "";

    const as3 = (value) => String(value).padStart(3, " ");
    const parts = [];
    if (mestrado > 0) {
      parts.push(`<span class="admissao-matrix-line">M: ${as3(mestrado)}</span>`);
    }
    if (doutorado > 0) {
      parts.push(`<span class="admissao-matrix-line">D: ${as3(doutorado)}</span>`);
    }
    parts.push(`<span class="admissao-matrix-line">T: ${as3(total)}</span>`);
    return parts.join("");
  }

  function createGraduatesTableCard(rows, axisEndYear) {
    const years = buildLastNYearsAxis(axisEndYear, MATRIX_LAST_YEARS);
    const counts = buildProgramYearLevelCounts(rows);
    const yearsHeaderHtml = years.map((year) => `<th scope="col">${year}</th>`).join("");

    const bodyRowsHtml = PROGRAM_ORDER.map((program) => {
      const cellHtml = years
        .map((year) => {
          const yearCounts = counts[program]?.[year] || { Mestrado: 0, Doutorado: 0 };
          const valueHtml = cellValueHtml(yearCounts.Mestrado, yearCounts.Doutorado);
          if (!valueHtml) return '<td class="admissao-matrix-cell is-empty"></td>';
          return `<td class="admissao-matrix-cell">${valueHtml}</td>`;
        })
        .join("");
      return `<tr><th scope="row" class="admissao-matrix-program">${program}</th>${cellHtml}</tr>`;
    }).join("");

    const section = document.createElement("section");
    section.className = "stats-card";
    section.id = "card-formados-tabela";
    section.innerHTML = `
      <div class="stats-card-head">
        <h2>Formados por Programa (Últimos ${MATRIX_LAST_YEARS} Anos de Conclusão)</h2>
        <p>Eixo X: anos de ${years[0]} a ${years[years.length - 1]}. Eixo Y: programas. Cada célula mostra M, D e T.</p>
      </div>
      <div class="admissao-matrix-wrap">
        <table class="admissao-matrix" aria-label="Tabela de formados por programa e ano">
          <thead>
            <tr>
              <th scope="col" class="admissao-matrix-program">Programa</th>
              ${yearsHeaderHtml}
            </tr>
          </thead>
          <tbody>
            ${bodyRowsHtml}
          </tbody>
        </table>
      </div>
    `;
    return section;
  }

  async function init() {
    if (typeof window.Plotly === "undefined") {
      throw new Error("Plotly não foi carregado.");
    }
    if (!cardsRoot) {
      throw new Error("Container de gráficos não encontrado.");
    }

    setStatus(`Processando formados (status ${TARGET_STATUS}) por ano de conclusão...`);
    const rawRows = await loadRows();
    const prepared = prepareRows(rawRows);
    const rows = prepared.rows;
    const prepStats = prepared.stats;
    const bounds = dataYearBounds(rows);
    if (!bounds) {
      throw new Error(
        `Nenhum registro com status ${TARGET_STATUS} e data de conclusão (${CONCLUSION_DATE_LABEL}) foi encontrado.`
      );
    }
    const mdbCurrentYear = await loadMdbCurrentYear();
    const axisEndYear = Number.isFinite(mdbCurrentYear)
      ? Math.max(bounds.max, mdbCurrentYear)
      : bounds.max;
    const fullYearAxis = buildContinuousYearAxis(bounds.min, axisEndYear);
    const levels = levelsFromRows(rows);

    cardsRoot.innerHTML = "";

    let cardsRendered = 0;

    const overallCard = createAllProgramsCard(rows.length);
    cardsRoot.appendChild(overallCard);
    renderAllProgramsByLevelChart("formados-geral-niveis-chart", rows, fullYearAxis);

    const summaryCard = createProgramTotalsCard(rows);
    cardsRoot.appendChild(summaryCard);

    const cumulativeYearCard = createYearCumulativeTotalsCard(rows, fullYearAxis);
    cardsRoot.appendChild(cumulativeYearCard);

    const tableCard = createGraduatesTableCard(rows, axisEndYear);
    cardsRoot.appendChild(tableCard);

    levels.forEach((level, index) => {
      const levelRows = rows.filter((row) => row.level === level);
      if (levelRows.length === 0) return;

      const card = createCard(level, levelRows.length, index);
      cardsRoot.appendChild(card);

      renderLargeChart(`formados-geral-${index}`, levelRows, fullYearAxis);
      renderMiniCharts(`formados-mini-grid-${index}`, levelRows, fullYearAxis, index);
      cardsRendered += 1;
    });

    setStatus(
      `Exibindo ${rows.length.toLocaleString("pt-BR")} formados com status ${TARGET_STATUS} ` +
        `e data de conclusão (${CONCLUSION_DATE_LABEL}), ISO excluído. ` +
        `Concluídos totais: ${prepStats.status_concluido.toLocaleString("pt-BR")}; ` +
        `concluídos não ISO: ${prepStats.non_iso.toLocaleString("pt-BR")}; ` +
        `concluídos não ISO sem data de conclusão: ${prepStats.without_conclusion_date.toLocaleString("pt-BR")}. ` +
        `${cardsRendered} painel(is) por nível, 1 painel geral por nível e 3 tabelas. ` +
        `Eixo anual: ${bounds.min} a ${axisEndYear}.`,
      false
    );
  }

  init().catch((error) => {
    console.error(error);
    setStatus(`Erro ao gerar formados: ${error.message}`, true);
  });
})();
