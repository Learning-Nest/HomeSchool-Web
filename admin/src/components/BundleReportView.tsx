import type { BundleReport } from '../api/types'
import { reportRows, reportTotals } from '../domain/bundle'

/** Shows what an import did (or, for a dry run, would do) per entity, and every problem the server found. */
export function BundleReportView({ report, heading }: { report: BundleReport; heading: string }) {
  const rows = reportRows(report)
  const totals = reportTotals(rows)
  return (
    <section className="panel" aria-labelledby="report-heading">
      <h2 id="report-heading">{heading}</h2>
      <p className={report.ok ? 'status-good' : 'status-bad'}>
        {report.ok
          ? report.dry_run
            ? 'No problems found. Nothing has been saved yet.'
            : 'Import complete.'
          : `${report.problems.length} problem${report.problems.length === 1 ? '' : 's'} found. Nothing was saved.`}
      </p>
      {report.ok && report.updated.activities ? (
        <p className="muted">
          {report.dry_run ? 'Updated' : 'Updating'} activities take the bundle's definition, replacing any edits made
          in this console.
        </p>
      ) : null}
      {!report.ok && (
        <ul className="problems" aria-label="Problems">
          {report.problems.map((problem, i) => (
            <li key={i}>{problem}</li>
          ))}
        </ul>
      )}
      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">
            {report.dry_run ? 'Changes this bundle would make' : 'Changes made by this import'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Entity</th>
              <th scope="col" className="num">
                {report.dry_run ? 'Would create' : 'Created'}
              </th>
              <th scope="col" className="num">
                {report.dry_run ? 'Would update' : 'Updated'}
              </th>
              <th scope="col" className="num">
                Unchanged
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.entity}>
                <th scope="row">{row.entity}</th>
                <td className="num">{row.created}</td>
                <td className="num">{row.updated}</td>
                <td className="num">{row.unchanged}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="num">{totals.created}</td>
              <td className="num">{totals.updated}</td>
              <td className="num">{totals.unchanged}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
