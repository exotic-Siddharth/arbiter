import {
  AdminUserPageSchema,
  AdminUserResponseSchema,
  type AdminUser,
  type Role,
} from '@arbiter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldCheck, ShieldOff, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { RatingBadge } from '@/components';
import { Page } from '@/components/layout/Page';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Pagination,
  QueryState,
  TBody,
  THead,
  Table,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { toast, toastError } from '@/lib/toast';
import { useCurrentUser } from '@/stores/auth';
import { useListParams } from './hooks/useListParams';

const PAGE_SIZE = 25;

/** /admin/users: search by username or email, promote or demote with a confirmation. */
export function Component() {
  const { page, setPage, search, text, setText } = useListParams();
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{ user: AdminUser; role: Role } | null>(null);
  const query = { search: search || undefined, page, pageSize: PAGE_SIZE };

  const users = useQuery({
    queryKey: qk.admin.users.list(query),
    queryFn: ({ signal }) =>
      api.get('/admin/users', { query, schema: AdminUserPageSchema, signal }),
    placeholderData: (previous) => previous,
  });

  const changeRole = useMutation({
    mutationFn: ({ user, role }: { user: AdminUser; role: Role }) =>
      api.patch(`/admin/users/${user.id}`, { role }, { schema: AdminUserResponseSchema }),
    onSuccess: ({ user }) => {
      toast.success(
        `${user.username} is now ${user.role === 'ADMIN' ? 'an admin' : 'a regular user'}`,
      );
      void queryClient.invalidateQueries({ queryKey: qk.admin.users.all });
    },
    onError: (error) => toastError(error, 'Could not change the role'),
  });

  const promote = pending?.role === 'ADMIN';

  return (
    <Page
      title="Users"
      documentTitle="Admin · Users"
      description="Search users and change roles. Admins can manage problems, contests and users."
    >
      <div className="space-y-4">
        <Input
          aria-label="Search users"
          placeholder="Search by username or email"
          leftIcon={<Search />}
          value={text}
          onChange={(event) => setText(event.target.value)}
          containerClassName="max-w-sm"
        />
        <Card className="overflow-hidden">
          <QueryState
            query={users}
            loading={<TableSkeleton rows={8} columns={6} />}
            isEmpty={(data) => data.items.length === 0}
            empty={
              <EmptyState
                icon={<Users />}
                title="No users match"
                description="Search matches usernames and e-mail addresses."
              />
            }
          >
            {(data) => (
              <Table aria-label="Users">
                <THead>
                  <Tr>
                    <Th>User</Th>
                    <Th>Role</Th>
                    <Th numeric>Rating</Th>
                    <Th numeric>Submissions</Th>
                    <Th>Joined</Th>
                    <Th className="w-36">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {data.items.map((user) => {
                    const self = user.id === me?.id;
                    const next: Role = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
                    return (
                      <Tr key={user.id} interactive>
                        <Td className="max-w-[18rem]">
                          <Link
                            to={`/u/${encodeURIComponent(user.username)}`}
                            className="block truncate font-medium hover:text-primary-text"
                          >
                            {user.username}
                          </Link>
                          <span className="block truncate text-xs text-muted">{user.email}</span>
                        </Td>
                        <Td>
                          <Badge tone={user.role === 'ADMIN' ? 'primary' : 'neutral'} size="sm">
                            {user.role === 'ADMIN' ? 'Admin' : 'User'}
                          </Badge>
                        </Td>
                        <Td numeric>
                          <RatingBadge
                            rating={user.rating}
                            showTier={false}
                            variant="text"
                            size="sm"
                          />
                        </Td>
                        <Td numeric>{formatNumber(user.submissionCount)}</Td>
                        <Td muted className="whitespace-nowrap">
                          {formatDate(user.createdAt)}
                        </Td>
                        <Td className="text-right">
                          <Button
                            size="xs"
                            variant="secondary"
                            leftIcon={next === 'ADMIN' ? <ShieldCheck /> : <ShieldOff />}
                            disabled={self}
                            aria-label={`${next === 'ADMIN' ? 'Make admin' : 'Remove admin'} for ${user.username}`}
                            title={self ? 'You cannot change your own role' : undefined}
                            onClick={() => setPending({ user, role: next })}
                          >
                            {next === 'ADMIN' ? 'Make admin' : 'Remove admin'}
                          </Button>
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </QueryState>
        </Card>
        {users.data && users.data.total > 0 ? (
          <Pagination
            page={users.data.page}
            pageSize={users.data.pageSize}
            total={users.data.total}
            onPageChange={setPage}
            itemLabel="users"
          />
        ) : null}
      </div>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={
          promote
            ? `Make ${pending?.user.username ?? 'user'} an admin?`
            : `Remove admin from ${pending?.user.username ?? 'user'}?`
        }
        description={
          promote
            ? 'Admins can edit every problem and contest, see all source code and change roles.'
            : 'They lose access to the admin console immediately, and keep their account and submissions.'
        }
        confirmLabel={promote ? 'Make admin' : 'Remove admin'}
        tone={promote ? 'primary' : 'danger'}
        onConfirm={async () => {
          if (pending) await changeRole.mutateAsync(pending);
        }}
      />
    </Page>
  );
}

export default Component;
