(function () {
  const statusEl = document.getElementById("transicoes-status");
  const summaryEl = document.getElementById("transicoes-resumo");
  const matrixRoot = document.getElementById("transicoes-matriz");
  const sankeyEl = document.getElementById("transicoes-sankey");

  const PLOTLY_CONFIG = {
    responsive: true,
    displayModeBar: false,
    displaylogo: false,
  };

  const PROGRAM_COLORS = {
    PGAST: "#8fc8ff",
    PGCAP: "#ffd36f",
    PGCST: "#7ee4b1",
    PGETE: "#ff9fb3",
    PGGES: "#c9a2ff",
    PGMET: "#79d6ff",
    PGSER: "#ffc48e",
    Outros: "#889ab8",
  };

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function setSummary(message) {
    if (!summaryEl) return;
    summaryEl.textContent = message;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
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

  function colorWithAlpha(hex, alpha) {
    const rgb = hexToRgb(hex);
    if (!rgb) return `rgba(136,154,184,${alpha})`;
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function sum(numbers) {
    return numbers.reduce((acc, current) => acc + safeNumber(current), 0);
  }

  async function loadTransitions() {
    const response = await fetch("Data/transicao_cic_mestrado_doutorado.json", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        `Falha ao carregar Data/transicao_cic_mestrado_doutorado.json (HTTP ${response.status}).`
      );
    }
    return response.json();
  }

  function normalizePayload(payload) {
    const categories = Array.isArray(payload?.categories) ? payload.categories : [];
    const matrix = Array.isArray(payload?.matrix_rows_mestrado_cols_doutorado)
      ? payload.matrix_rows_mestrado_cols_doutorado
      : [];

    if (!categories.length || !matrix.length) {
      throw new Error("Matriz de transição vazia ou inválida.");
    }

    if (matrix.length !== categories.length) {
      throw new Error("Dimensão da matriz não corresponde às categorias.");
    }

    const normalizedMatrix = matrix.map((row) => {
      if (!Array.isArray(row) || row.length !== categories.length) {
        throw new Error("Linhas da matriz com dimensão inválida.");
      }
      return row.map((cell) => safeNumber(cell));
    });

    const computedRowTotals = normalizedMatrix.map((row) => sum(row));
    const computedColTotals = categories.map((_, colIndex) =>
      sum(normalizedMatrix.map((row) => row[colIndex]))
    );

    const rowTotals =
      Array.isArray(payload?.row_totals) && payload.row_totals.length === categories.length
        ? payload.row_totals.map((value) => safeNumber(value))
        : computedRowTotals;

    const colTotals =
      Array.isArray(payload?.col_totals) && payload.col_totals.length === categories.length
        ? payload.col_totals.map((value) => safeNumber(value))
        : computedColTotals;

    const grandTotal = safeNumber(payload?.grand_total) || sum(rowTotals);

    return {
      categories,
      matrix: normalizedMatrix,
      rowTotals,
      colTotals,
      grandTotal,
    };
  }

  function renderMatrixTable({ categories, matrix, rowTotals, colTotals, grandTotal }) {
    if (!matrixRoot) return;

    const headerCells = categories
      .map((category) => `<th scope="col">${escapeHtml(category)}</th>`)
      .join("");

    const bodyRows = categories
      .map((rowCategory, rowIndex) => {
        const rowCells = matrix[rowIndex]
          .map((value) => `<td class="admissao-matrix-cell">${value.toLocaleString("pt-BR")}</td>`)
          .join("");

        return `
          <tr>
            <th scope="row" class="admissao-matrix-program">${escapeHtml(rowCategory)}</th>
            ${rowCells}
            <td class="admissao-matrix-cell">${rowTotals[rowIndex].toLocaleString("pt-BR")}</td>
          </tr>
        `;
      })
      .join("");

    const totalCells = colTotals
      .map((value) => `<td class="admissao-matrix-cell">${value.toLocaleString("pt-BR")}</td>`)
      .join("");

    matrixRoot.innerHTML = `
      <div class="admissao-matrix-wrap">
        <table class="admissao-matrix transicoes-matrix" aria-label="Matriz de transição mestrado para doutorado">
          <thead>
            <tr>
              <th scope="col" class="admissao-matrix-program">Mestrado \\ Doutorado</th>
              ${headerCells}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
            <tr>
              <th scope="row" class="admissao-matrix-program">Total</th>
              ${totalCells}
              <td class="admissao-matrix-cell">${grandTotal.toLocaleString("pt-BR")}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSankey({ categories, matrix }) {
    if (!sankeyEl) return;
    if (typeof window.Plotly === "undefined") {
      throw new Error("Plotly não foi carregado.");
    }

    const leftLabels = categories.map((category) => `M: ${category}`);
    const rightLabels = categories.map((category) => `D: ${category}`);
    const labels = [...leftLabels, ...rightLabels];

    const leftColors = categories.map((category) => PROGRAM_COLORS[category] || PROGRAM_COLORS.Outros);
    const rightColors = categories.map((category) => PROGRAM_COLORS[category] || PROGRAM_COLORS.Outros);
    const nodeColors = [...leftColors, ...rightColors];

    const source = [];
    const target = [];
    const value = [];
    const customdata = [];
    const linkColors = [];

    matrix.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell <= 0) return;
        source.push(rowIndex);
        target.push(categories.length + colIndex);
        value.push(cell);
        customdata.push(`${leftLabels[rowIndex]} \u2192 ${rightLabels[colIndex]}`);
        linkColors.push(colorWithAlpha(leftColors[rowIndex], 0.45));
      });
    });

    const data = [
      {
        type: "sankey",
        arrangement: "snap",
        valueformat: ",d",
        valuesuffix: " alunos",
        node: {
          pad: 14,
          thickness: 16,
          line: { color: "rgba(219,231,255,0.2)", width: 1 },
          label: labels,
          color: nodeColors,
          hovertemplate: "%{label}<extra></extra>",
        },
        link: {
          source,
          target,
          value,
          customdata,
          color: linkColors,
          hovertemplate: "%{customdata}<br>%{value} alunos<extra></extra>",
        },
      },
    ];

    const layout = {
      margin: { l: 24, r: 24, t: 10, b: 10 },
      paper_bgcolor: "#0d1727",
      plot_bgcolor: "#0d1727",
      font: { color: "#dbe7ff", family: "Sora, sans-serif", size: 12 },
    };

    window.Plotly.newPlot(sankeyEl, data, layout, PLOTLY_CONFIG);
  }

  function buildSummary({ categories, matrix, rowTotals, colTotals, grandTotal }) {
    const indexOutros = categories.indexOf("Outros");
    const principalIndexes = categories
      .map((category, index) => ({ category, index }))
      .filter((item) => item.category !== "Outros")
      .map((item) => item.index);

    const mesmoPrograma = principalIndexes.reduce(
      (acc, index) => acc + safeNumber(matrix[index]?.[index]),
      0
    );

    const doutoradoSemMestrado = indexOutros >= 0 ? safeNumber(rowTotals[indexOutros]) : 0;
    const mestradoSemDoutorado = indexOutros >= 0 ? safeNumber(colTotals[indexOutros]) : 0;

    return (
      `Total na matriz: ${grandTotal.toLocaleString("pt-BR")} alunos. ` +
      `Mesmo programa (7): ${mesmoPrograma.toLocaleString("pt-BR")}. ` +
      `Doutorado sem Mestrado: ${doutoradoSemMestrado.toLocaleString("pt-BR")}. ` +
      `Mestrado sem Doutorado: ${mestradoSemDoutorado.toLocaleString("pt-BR")}.`
    );
  }

  async function init() {
    setStatus("Carregando matriz de transições por CIC...");
    const payload = await loadTransitions();
    const data = normalizePayload(payload);

    renderSankey(data);
    renderMatrixTable(data);
    setSummary(buildSummary(data));

    setStatus(
      `Exibindo matriz ${data.categories.length}x${data.categories.length} ` +
        `com ${data.grandTotal.toLocaleString("pt-BR")} alunos.`,
      false
    );
  }

  init().catch((error) => {
    console.error(error);
    setStatus(`Erro ao carregar transições: ${error.message}`, true);
  });
})();
