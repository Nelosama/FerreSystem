/**
 * Utility helper to export an array of JSON objects to a downloadable CSV file in UTF-8 BOM encoding.
 */
export function exportToCSV<T extends Record<string, any>>(filename: string, data: T[], headers?: { key: keyof T; label: string }[]) {
  if (!data || data.length === 0) {
    alert('No hay datos disponibles para exportar.');
    return;
  }

  const columns = headers || Object.keys(data[0]).map((key) => ({ key: key as keyof T, label: key }));

  const csvHeader = columns.map((col) => `"${String(col.label).replace(/"/g, '""')}"`).join(',');

  const csvRows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key];
        if (value === null || value === undefined) {
          return '""';
        }
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        return `"${String(value).replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  const csvContent = '\uFEFF' + [csvHeader, ...csvRows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
