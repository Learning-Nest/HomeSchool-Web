/** Anyone who may sign in to this console: educators write activities, admins also review, publish and manage. */
export function isStaffRole(role: string | null | undefined): boolean {
  return role === 'educator' || role === 'content_admin' || role === 'super_admin'
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'content_admin' || role === 'super_admin'
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
  return role === 'super_admin'
}
