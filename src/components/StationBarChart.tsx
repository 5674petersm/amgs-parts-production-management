type StationBarChartProps = {
  rows: { station: string; totalQty: number }[];
  title: string;
  description: string;
};

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function sumQty(rows: { totalQty: number }[]): number {
  return rows.reduce((sum, row) => sum + row.totalQty, 0);
}

export function StationBarChart({ rows, title, description }: StationBarChartProps) {
  const maxQty = Math.max(...rows.map((row) => row.totalQty), 1);
  const grandTotal = sumQty(rows);

  return (
    <article className="card dashboard-panel">
      <h2>{title}</h2>
      <p className="hint">{description}</p>
      <p className="dashboard-total">
        Grand total: <strong>{formatNumber(grandTotal)}</strong>
      </p>
      <ul className="bar-chart" aria-label={title}>
        {rows.map((row) => {
          const widthPercent =
            row.totalQty > 0 ? (row.totalQty / maxQty) * 100 : 0;

          return (
            <li key={row.station} className="bar-chart-row">
              <span className="bar-chart-label">{row.station}</span>
              <div
                className="bar-chart-track"
                role="img"
                aria-label={`${row.station}: ${formatNumber(row.totalQty)}`}
              >
                <div
                  className="bar-chart-fill"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              <span className="bar-chart-value">{formatNumber(row.totalQty)}</span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
