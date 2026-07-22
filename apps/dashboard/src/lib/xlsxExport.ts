/**
 * Export XLSX mutualise.
 *
 * `xlsx` pese ~283 Ko une fois bundle. C'etait un import statique dans cinq
 * fichiers, donc telecharge des l'ouverture d'Analytics ou de Sanctions alors
 * que l'export est une action rare et volontaire. L'import est ici differe
 * jusqu'au clic : le module n'arrive que si l'utilisateur exporte vraiment,
 * puis reste en cache pour les exports suivants.
 */

export type XlsxSheet = {
  name: string;
  rows: Record<string, unknown>[];
};

/**
 * Excel refuse les onglets de plus de 31 caracteres et les caracteres \ / * ? : [ ].
 */
function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'sheet';
}

/**
 * Construit un classeur a partir des feuilles fournies et declenche le
 * telechargement. Les feuilles vides sont ignorees.
 *
 * @returns `false` si rien n'etait exportable (aucune ligne), `true` sinon.
 */
export async function downloadXlsx(fileName: string, sheets: XlsxSheet[]): Promise<boolean> {
  const usable = sheets.filter((sheet) => sheet.rows.length > 0);
  if (usable.length === 0) return false;

  const XLSX = await import('xlsx');

  const workbook = XLSX.utils.book_new();
  for (const sheet of usable) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(sheet.rows),
      sanitizeSheetName(sheet.name),
    );
  }

  XLSX.writeFile(workbook, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
  return true;
}

/** Raccourci pour le cas courant : un seul onglet. */
export function downloadSingleSheetXlsx(
  fileName: string,
  sheetName: string,
  rows: Record<string, unknown>[],
): Promise<boolean> {
  return downloadXlsx(fileName, [{ name: sheetName, rows }]);
}
