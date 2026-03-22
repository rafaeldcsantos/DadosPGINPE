(function () {
  const footer = document.querySelector(".footer");
  if (!footer) return;

  const FOOTER_PREFIX = "Dados extraídos da base de dados do controle acadêmico em ";
  const FALLBACK_TEXT = `${FOOTER_PREFIX}data indisponível.`;

  function parseIsoWithoutTimezone(value) {
    if (typeof value !== "string") return null;
    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);

    return new Date(year, month, day, hour, minute, second);
  }

  function extractUpdateDate(metadata) {
    const candidates = [
      metadata?.msysobjects?.latest_object_dateupdate,
      metadata?.source_filename_date,
      metadata?.source_file_modified_utc,
    ];

    for (const rawValue of candidates) {
      if (!rawValue) continue;

      const parsed = parseIsoWithoutTimezone(rawValue) || new Date(rawValue);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
  }

  function formatDatePtBr(date) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  async function setFooterDate() {
    try {
      const response = await fetch("Data/mdb_metadata.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const metadata = await response.json();
      const updateDate = extractUpdateDate(metadata);
      if (!updateDate) {
        footer.textContent = FALLBACK_TEXT;
        return;
      }

      footer.textContent = `${FOOTER_PREFIX}${formatDatePtBr(updateDate)}.`;
    } catch (_error) {
      footer.textContent = FALLBACK_TEXT;
    }
  }

  setFooterDate();
})();
