const cleanLabel = (value: string | null | undefined) =>
  value?.replace(/\s+/g, ' ').trim() ?? '';

function enhanceTable(table: HTMLTableElement): void {
  // Several pages already ship a dedicated mobile card list next to a
  // `hidden md:block` desktop table. Leave that intentional pair untouched.
  if (table.closest('.hidden')) return;

  if (table.dataset.mobileTable === 'scroll') {
    table.classList.add('mobile-scroll-table');
    return;
  }

  const headers = Array.from(table.querySelectorAll(':scope > thead > tr:last-child > th'));
  const rows = Array.from(table.querySelectorAll(':scope > tbody > tr'));
  const labels = headers.map((header) =>
    cleanLabel(header.getAttribute('aria-label') || header.textContent),
  );
  const hasInteractiveHeaders = headers.some((header) =>
    Boolean(header.querySelector('button, input, select, [role="button"]')),
  );

  const canBecomeCards =
    labels.length >= 2 &&
    rows.length > 0 &&
    labels.some(Boolean) &&
    !hasInteractiveHeaders &&
    rows.every((row) => {
      const cells = Array.from(row.children).filter(
        (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement,
      );
      return cells.length === labels.length && cells.every((cell) => cell.colSpan === 1);
    });

  table.classList.toggle('mobile-card-table', canBecomeCards);
  table.classList.toggle('mobile-scroll-table', !canBecomeCards);

  if (!canBecomeCards) return;

  for (const row of rows) {
    const cells = Array.from(row.children).filter(
      (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement,
    );
    cells.forEach((cell, index) => {
      const label = labels[index];
      if (label) cell.dataset.label = label;
      else delete cell.dataset.label;
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
