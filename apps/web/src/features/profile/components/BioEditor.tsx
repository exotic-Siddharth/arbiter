import { LIMITS, MeResponseSchema, PatchMeBody } from '@arbiter/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { api, fieldErrors, getErrorMessage } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { toast } from '@/lib/toast';
import { useAuth } from '@/stores/auth';

export interface BioEditorProps {
  username: string;
  bio: string | null;
}

/** The bio text with, for the profile owner only, an inline editor (PATCH /users/me, 280 chars). */
export function BioEditor({ username, bio }: BioEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bio ?? '');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const setUser = useAuth((state) => state.setUser);

  const save = useMutation({
    mutationFn: (body: PatchMeBody) => api.patch('/users/me', body, { schema: MeResponseSchema }),
    onSuccess: ({ user }) => {
      setUser(user);
      void queryClient.invalidateQueries({ queryKey: qk.users.profile(username) });
      toast.success('Bio updated');
      setEditing(false);
    },
    onError: (err) => setError(fieldErrors(err).bio ?? getErrorMessage(err)),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = PatchMeBody.safeParse({ bio: draft });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid bio');
      return;
    }
    setError(null);
    save.mutate({ bio: parsed.data.bio === '' ? null : parsed.data.bio });
  };

  if (!editing) {
    return (
      <div className="space-y-2">
        {bio ? (
          <p className="max-w-2xl text-[15px] break-words whitespace-pre-line text-foreground/90">
            {bio}
          </p>
        ) : (
          <p className="text-sm text-muted">No bio yet. Tell people what you like to solve.</p>
        )}
        <Button
          variant="outline"
          size="xs"
          leftIcon={<Pencil />}
          onClick={() => {
            setDraft(bio ?? '');
            setError(null);
            setEditing(true);
          }}
        >
          {bio ? 'Edit bio' : 'Add a bio'}
        </Button>
      </div>
    );
  }

  const remaining = LIMITS.bioMaxChars - draft.length;
  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-3" noValidate>
      <Textarea
        label="Bio"
        value={draft}
        rows={3}
        maxLength={LIMITS.bioMaxChars + 40}
        autoFocus
        error={error}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        labelAction={
          <span
            className={remaining < 0 ? 'font-medium text-danger' : 'tabular-nums'}
            aria-live="polite"
          >
            {draft.length} / {LIMITS.bioMaxChars}
          </span>
        }
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={save.isPending}>
          Save
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={save.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
