import { toast } from 'sonner';
import { getErrorMessage, isApiError } from './http';

export { toast };

function titleFor(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong';
  switch (error.code) {
    case 'RATE_LIMITED':
      return 'Slow down';
    case 'NETWORK_ERROR':
      return 'Connection problem';
    case 'UNAUTHORIZED':
      return 'Please log in';
    case 'FORBIDDEN':
      return 'Not allowed';
    case 'NOT_FOUND':
      return 'Not found';
    case 'CONFLICT':
      return 'Already exists';
    case 'VALIDATION_ERROR':
      return 'Check your input';
    case 'PAYLOAD_TOO_LARGE':
      return 'Too large';
    default:
      return 'Something went wrong';
  }
}

/**
 * Error toast for a failed mutation. The description is the server message; for 429 it ends
 * with the wait, e.g. "Too many submissions. Try again in 37 s.".
 *
 *   onError: (error) => toastError(error, 'Submission not sent')
 */
export function toastError(error: unknown, title?: string): void {
  toast.error(title ?? titleFor(error), { description: getErrorMessage(error) });
}
