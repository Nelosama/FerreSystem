/**
 * Utility helper to export an array of JSON objects to a downloadable Excel Spreadsheet (.xls / .xlsx XML format)
 * with UTF-8 encoding, column data types, and custom headers.
 */
export function exportToExcel<T extends Record<string, any>>(
  filename: string,
  data: T[],
  headers?: { key: keyof T; label: string }[],
) {
  if (!data || data.length === 0) {
    alert('No hay datos disponibles para exportar a Excel.');
    return;
  }

  const columns = headers || Object.keys(data[0]).map((key) => ({ key: key as keyof T, label: key }));

  const cleanFilename = filename.endsWith('.xls') || filename.endsWith('.xlsx') ? filename : `${filename}.xls`;

  // XML Spreadsheet 2003 template supported natively by Excel and LibreOffice
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="HeaderStyle">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1C1917" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="StringStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="NumberStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Reporte">
  <Table>`;

  // Header row
  xml += '\n   <Row ss:Height="24">';
  columns.forEach((col) => {
    xml += `\n    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(String(col.label))}</Data></Cell>`;
  });
  xml += '\n   </Row>';

  // Data rows
  data.forEach((row) => {
    xml += '\n   <Row ss:Height="20">';
    columns.forEach((col) => {
      const val = row[col.key];
      if (val === null || val === undefined) {
        xml += '\n    <Cell ss:StyleID="StringStyle"><Data ss:Type="String"></Data></Cell>';
      } else if (typeof val === 'number') {
        xml += `\n    <Cell ss:StyleID="NumberStyle"><Data ss:Type="Number">${val}</Data></Cell>`;
      } else if (typeof val === 'boolean') {
        xml += `\n    <Cell ss:StyleID="StringStyle"><Data ss:Type="String">${val ? 'SÍ' : 'NO'}</Data></Cell>`;
      } else if (typeof val === 'object') {
        xml += `\n    <Cell ss:StyleID="StringStyle"><Data ss:Type="String">${escapeXml(JSON.stringify(val))}</Data></Cell>`;
      } else {
        xml += `\n    <Cell ss:StyleID="StringStyle"><Data ss:Type="String">${escapeXml(String(val))}</Data></Cell>`;
      }
    });
    xml += '\n   </Row>';
  });

  xml += `
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', cleanFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
