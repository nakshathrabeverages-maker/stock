export interface CsvHeader {
  label: string;
  key: string;
}

const sanitizeCsvValue = (value: any) => {
  const stringValue = value === undefined || value === null ? '' : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

export const downloadCsv = (rows: any[], headers: CsvHeader[], filename: string) => {
  const csvRows = [headers.map((header) => sanitizeCsvValue(header.label)).join(',')];

  rows.forEach((row) => {
    csvRows.push(
      headers
        .map((header) => sanitizeCsvValue(row[header.key]))
        .join(',')
    );
  });

  const blob = new Blob(["\ufeff", csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
