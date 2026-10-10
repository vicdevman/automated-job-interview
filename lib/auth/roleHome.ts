/**
 * Where each role lands right after signing in. Shared by auth.config.ts
 * (redirecting someone who revisits /login while already signed in) and
 * LoginForm (redirecting right after a successful sign-in) so the two never
 * drift — an interviewer should never be dropped on the candidate dashboard
 * and have to find their way to Sessions themselves.
 */
export function roleHome(role: 'candidate' | 'interviewer' | undefined): string {
  return role === 'interviewer' ? '/interviewer/sessions' : '/dashboard';
}
