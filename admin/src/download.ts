/** Saves a downloaded file through the browser (used for the CSV export, which needs the bearer token). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before the link is revoked.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
