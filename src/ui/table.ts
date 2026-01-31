export function renderTable(
  data: Record<string, string | number>
): HTMLElement {
  const table = document.createElement('table');
  table.className = 'data-table';

  for (const [key, value] of Object.entries(data)) {
    const row = document.createElement('tr');

    const labelCell = document.createElement('th');
    labelCell.textContent = formatLabel(key);
    row.appendChild(labelCell);

    const valueCell = document.createElement('td');
    valueCell.textContent = String(value);
    row.appendChild(valueCell);

    table.appendChild(row);
  }

  return table;
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
