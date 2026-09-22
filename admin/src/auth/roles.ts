export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'content_admin' || role === 'super_admin'
}
