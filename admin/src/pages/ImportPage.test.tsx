import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BundleReport } from '../api/types'
import { apiError, json, makeClient, type Call } from '../test/fakeApi'
import { renderApp } from '../test/renderApp'

const report = (over: Partial<BundleReport> = {}): BundleReport => ({
  dry_run: true,
  ok: true,
  problems: [],
  created: { activities: 2 },
  updated: {},
  unchanged: { levels: 5 },
  ...over,
})

const bundleText = JSON.stringify({ version: '2026.09.2', levels: [{ code: 'L1', name: 'One' }], activities: [{ slug: 'a' }, { slug: 'b' }] })

function chooseFile(text: string, name = 'bundle.json') {
  const input = screen.getByLabelText('Bundle file') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'application/json' })] } })
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement

describe('import page', () => {
  it('always dry-runs first, then applies with dry_run false', async () => {
    const bodies: Call['body'][] = []
    const { client } = makeClient({
      'POST /v1/admin/content/bundle': ({ body }) => {
        bodies.push(body)
        return json(200, report({ dry_run: (body as { dry_run: boolean }).dry_run }))
      },
    })
    renderApp(client, '/import')
    await screen.findByRole('heading', { name: 'Import content' })

    expect(button('Check bundle (dry run)').disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull()

    chooseFile(bundleText)
    expect(await screen.findByText(/bundle version/)).toBeTruthy()
    expect(screen.getByText('2 activities')).toBeTruthy()
    fireEvent.click(button('Check bundle (dry run)'))

    expect(await screen.findByRole('heading', { name: 'Dry-run result' })).toBeTruthy()
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ version: '2026.09.2', dry_run: true, auto_publish: false })
    expect(button('Apply import').disabled).toBe(false)

    fireEvent.click(button('Apply import'))
    expect(await screen.findByRole('heading', { name: 'Import result' })).toBeTruthy()
    expect(bodies[1]).toMatchObject({ dry_run: false, auto_publish: false })
    expect(screen.queryByRole('heading', { name: 'Dry-run result' })).toBeNull()
    // A second apply needs a fresh dry run.
    expect(screen.queryByRole('button', { name: 'Apply import' })).toBeNull()
  })

  it('keeps Apply disabled when the dry run found problems', async () => {
    const { client } = makeClient({
      'POST /v1/admin/content/bundle': () => json(200, report({ ok: false, problems: ['activity a: unknown skill X.Y.Z'] })),
    })
    renderApp(client, '/import')
    chooseFile(bundleText)
    fireEvent.click(await screen.findByRole('button', { name: 'Check bundle (dry run)' }))

    expect(await screen.findByText('activity a: unknown skill X.Y.Z')).toBeTruthy()
    expect(button('Apply import').disabled).toBe(true)
  })

  it('requires a new dry run when the publish option changes, and confirms publishing', async () => {
    const bodies: { dry_run: boolean; auto_publish: boolean }[] = []
    const { client } = makeClient({
      'POST /v1/admin/content/bundle': ({ body }) => {
        bodies.push(body as { dry_run: boolean; auto_publish: boolean })
        return json(200, report({ dry_run: (body as { dry_run: boolean }).dry_run }))
      },
    })
    renderApp(client, '/import')
    chooseFile(bundleText)
    fireEvent.click(await screen.findByRole('button', { name: 'Check bundle (dry run)' }))
    await screen.findByRole('heading', { name: 'Dry-run result' })

    fireEvent.click(screen.getByLabelText('Also publish the imported activities'))
    expect(button('Apply import').disabled).toBe(true)
    expect(screen.getByText(/publish option changed since the dry run/)).toBeTruthy()

    fireEvent.click(button('Check bundle (dry run)'))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toMatchObject({ dry_run: true, auto_publish: true })
    await waitFor(() => expect(button('Apply import').disabled).toBe(false))

    fireEvent.click(button('Apply import'))
    const dialog = await screen.findByRole('dialog', { name: 'Apply and publish?' })
    expect(bodies).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply and publish' }))
    await waitFor(() => expect(bodies).toHaveLength(3))
    expect(bodies[2]).toMatchObject({ dry_run: false, auto_publish: true })
  })

  it('rejects a file that is not a bundle without calling the API', async () => {
    const { client, calls } = makeClient({})
    renderApp(client, '/import')
    chooseFile('{"levels": []}', 'wrong.json')

    expect((await screen.findByRole('alert')).textContent).toContain('needs a "version"')
    expect(button('Check bundle (dry run)').disabled).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('shows a server error with its request id', async () => {
    const { client } = makeClient({ 'POST /v1/admin/content/bundle': () => apiError(422, 'validation_error', { details: [{ loc: ['body', 'version'], msg: 'too long' }] }) })
    renderApp(client, '/import')
    chooseFile(bundleText)
    fireEvent.click(await screen.findByRole('button', { name: 'Check bundle (dry run)' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('req-123')
    expect(alert.textContent).toContain('too long')
  })
})
