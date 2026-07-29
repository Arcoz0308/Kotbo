const cleanLabel = (value: string | null | undefined) =>
  value?.replace(/\s+/g, ' ').trim() ?? '';

function getHeaderLabels(table: HTMLTableElement): string[] {
  const headerRows = Array.from(table.tHead?.rows ?? []);
  const labels: string[] = [];
  const occupiedByRowspan: number[] = [];

  headerRows.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      occupiedByRowspan.forEach((remaining, index) => {
        occupiedByRowspan[index] = Math.max(remaining - 1, 0);
      });
    }

    let columnIndex = 0;
    Array.from(row.cells).forEach((header) => {
      while (occupiedByRowspan[columnIndex] > 0) columnIndex += 1;

      const label = cleanLabel(header.getAttribute('aria-label') || header.textContent);
      const columnSpan = Math.max(header.colSpan, 1);
      const rowSpan = Math.max(header.rowSpan, 1);

      for (let offset = 0; offset < columnSpan; offset += 1) {
        if (label) labels[columnIndex + offset] = label;
        occupiedByRowspan[columnIndex + offset] = rowSpan;
      }
      columnIndex += columnSpan;
    });
  });

  return labels;
}

function enhanceTable(table: HTMLTableElement): void {
  // Several pages already ship a dedicated mobile card list next to a
  // `hidden md:block` desktop table. Leave that intentional pair untouched.
  if (table.closest('.hidden')) return;

  if (table.dataset.mobileTable === 'scroll') {
    table.classList.add('mobile-scroll-table');
    return;
  }

  const rows = Array.from(table.querySelectorAll(':scope > tbody > tr'));
  const labels = getHeaderLabels(table);
  const canBecomeCards =
    labels.length >= 1 &&
    rows.length > 0 &&
    labels.some(Boolean) &&
    rows.every((row) => {
      const cells = Array.from(row.children).filter(
        (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement,
      );
      const coveredColumns = cells.reduce((total, cell) => total + Math.max(cell.colSpan, 1), 0);
      return cells.length > 0 && coveredColumns <= labels.length;
    });

  table.classList.toggle('mobile-card-table', canBecomeCards);
  table.classList.toggle('mobile-scroll-table', !canBecomeCards);

  if (!canBecomeCards) return;

  for (const row of rows) {
    const cells = Array.from(row.children).filter(
      (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement,
    );
    let columnIndex = 0;
    cells.forEach((cell) => {
      const span = Math.max(cell.colSpan, 1);
      const label = labels.slice(columnIndex, columnIndex + span).filter(Boolean).join(' · ');
      const isSummary = cells.length === 1 && span > 1;
      cell.dataset.label = isSummary
        ? ''
        : label || (cell.querySelector('button, a, input, select') ? 'Actions' : '');
      cell.classList.toggle('mobile-table-summary', isSummary);
      cell.classList.toggle(
        'mobile-table-actions',
        Boolean(cell.querySelector('button, a[role="button"], input, select')),
      );
      columnIndex += span;
    });
  }
}

/**
 * Progressive enhancement for the many data tables in the dashboard.
 * Simple tables become labelled cards on narrow screens. Complex tables keep
 * their native structure and receive a safe horizontal scrolling container.
 */
export function responsiveTables(node: HTMLElement) {
  let frame = 0;

  const scan = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      node.querySelectorAll('table').forEach((table) => {
        if (table instanceof HTMLTableElement) enhanceTable(table);
      });
    });
  };

  const observer = new MutationObserver(scan);
  observer.observe(node, { childList: true, subtree: true });
  scan();

  return {
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}
