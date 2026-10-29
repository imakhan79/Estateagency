// Report export: CSV, Excel (.xlsx) and PDF via the browser's print dialog (BRD §12.6).

export interface ExportColumn {
  key: string;
  header: string;
  value?: (row: Record<string, unknown>) => string | number | null | undefined;
}

function cell(row: Record<string, unknown>, c: ExportColumn) {
  const v = c.value ? c.value(row) : row[c.key];
  return v == null ? "" : (v as string | number);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]) {
  const esc = (v: string | number) => {
    const s = String(v);
    // Prefix formula-like values so spreadsheet apps don't execute them.
    const safe = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [columns.map((c) => esc(c.header)).join(","), ...rows.map((r) => columns.map((c) => esc(cell(r, c))).join(","))];
  download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

export async function exportXlsx(filename: string, title: string, columns: ExportColumn[], rows: Record<string, unknown>[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(12, c.header.length + 4) }));
  rows.forEach((r) => ws.addRow(Object.fromEntries(columns.map((c) => [c.key, cell(r, c)]))));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}.xlsx`);
}

export function exportPdf(title: string, columns: ExportColumn[], rows: Record<string, unknown>[], subtitle = "") {
  const w = window.open("", "_blank");
  if (!w) return;
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>body{font:12px system-ui,sans-serif;margin:24px;color:#222}h1{font-size:18px;margin:0}p{color:#666;margin:4px 0 16px}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:5px 7px;text-align:left}th{background:#f3f3f3}
    @page{size:landscape;margin:12mm}</style></head><body>
    <h1>${esc(title)}</h1><p>${esc(subtitle)} · Generated ${esc(new Date().toLocaleString("en-GB"))} · ${rows.length} rows</p>
    <table><thead><tr>${columns.map((c) => `<th>${esc(c.header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(cell(r, c))}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <script>window.onload=()=>{window.print()}</script></body></html>`);
  w.document.close();
}
