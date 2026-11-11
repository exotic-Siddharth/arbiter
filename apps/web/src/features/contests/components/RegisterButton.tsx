import type { ContestStatus } from '@arbiter/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { Badge, Button, ButtonLink } from '@/components/ui';
import { api, getErrorMessage, isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queryKeys';
import { toast, toastError } from '@/lib/toast';
import { loginHref } from '@/lib/url';
import { useCurrentUser } from '@/stores/auth';

export interface RegisterButtonProps {
  contest: { slug: string; title: string; status: ContestStatus; isRegistered: boolean };
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * POST /api/contests/:slug/register (204). A 409 means the user is already registered and a
 * 403 that registration has closed (the contest ended); both refresh the contest and leave a
 * short inline note instead of a dead button.
 */
export function RegisterButton({ contest, size = 'md', className }: RegisterButtonProps) {
  const user = useCurrentUser();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () => api.post<void>(`/contests/${encodeURIComponent(contest.slug)}/register`),
    onSuccess: () => {
      setNote(null);
      toast.success(`Registered for ${contest.title}`);
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        setNote('You are already registered for this contest.');
      } else if (isApiError(error) && error.status === 403) {
        setNote(getErrorMessage(error) || 'Registration is closed: the contest has ended.');
      } else {
        toastError(error, 'Registration failed');
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.contests.all }),
  });

  if (contest.isRegistered) {
    return (
      <Badge
        tone="success"
        size={size}
        icon={<CircleCheck />}
        className={className}
        aria-label="You are registered"
      >
        Registered
      </Badge>
    );
  }
  if (contest.status === 'ENDED') {
    return <span className={cn('text-xs text-muted', className)}>Registration closed</span>;
  }
  if (!user) {
    return (
      <ButtonLink
        to={loginHref(location.pathname + location.search)}
        variant="secondary"
        size={size === 'sm' ? 'sm' : 'md'}
        className={className}
      >
        Log in to register
      </ButtonLink>
    );
  }
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <Button
        variant="primary"
        size={size === 'sm' ? 'sm' : 'md'}
        loading={register.isPending}
        onClick={() => register.mutate()}
      >
        Register
      </Button>
      {note ? (
        <p role="alert" className="text-xs text-danger">
          {note}
        </p>
      ) : null}
    </div>
  );
}
