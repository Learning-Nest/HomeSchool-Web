import { Link } from 'react-router-dom'
import type { ActivityEvent } from '../api/types'
import { actionLabel, describeEvent } from '../domain/events'
import { formatDateTime } from '../format'

/** The activity log as a table. `showWho` is off on a single person's page, where the name would repeat. */
export function EventTable({ events, showWho = true, label }: { events: readonly ActivityEvent[]; showWho?: boolean; label: string }) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">When</th>
            {showWho && <th scope="col">Who</th>}
            <th scope="col">What</th>
            <th scope="col">Activity</th>
            <th scope="col" className="num">
              Version
            </th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>
                <time dateTime={e.at}>{formatDateTime(e.at)}</time>
              </td>
              {showWho && <td>{e.actor_name ?? 'Unknown'}</td>}
              <td>{actionLabel(e.action)}</td>
              <td>
                <Link to={`/activities/${e.activity_id}`}>{e.activity_title}</Link>
              </td>
              <td className="num">{e.version ?? ''}</td>
              <td>{describeEvent(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
