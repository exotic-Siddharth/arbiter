import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { BulkUploadDialog } from './BulkUploadDialog';

const file = (name: string, text: string) => new File([text], name, { type: 'text/plain' });

function renderDialog(existingCount = 4) {
  return renderWithProviders(
    <BulkUploadDialog
      open
      onOpenChange={() => undefined}
      problemId="p1"
      existingCount={existingCount}
    />,
  );
}

describe('BulkUploadDialog', () => {
  it('pairs the selected files, lists orphans, and posts replace=true in file order', async () => {
    const api = mockFetch({
      'POST /api/admin/problems/p1/tests/bulk': () => jsonResponse(200, { created: 2, total: 2 }),
    });
    // Dropped files bypass the picker's accept filter, so keep notes.txt in the selection.
    const user = userEvent.setup({ applyAccept: false });
    renderDialog(4);

    await user.upload(screen.getByLabelText('Test files'), [
      file('02.in', '5 6\r\n'),
      file('01.out', '3\r\n'),
      file('01.in', '1 2\r\n'),
      file('02.out', '11\n'),
      file('03.in', 'lonely\n'),
      file('notes.txt', 'x'),
    ]);

    const pairs = within(screen.getByRole('list', { name: 'Paired tests' })).getAllByRole(
      'listitem',
    );
    expect(pairs.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^1.*01/),
      expect.stringMatching(/^2.*02/),
    ]);
    const orphans = screen.getByRole('list', { name: 'Unpaired files' });
    expect(orphans).toHaveTextContent('03.in');
    expect(orphans).toHaveTextContent('No matching .out file');
    expect(screen.getByText(/Ignored .*notes\.txt/)).toBeInTheDocument();

    // Append stays the default; replace is an explicit, clearly marked opt-in.
    expect(screen.getByRole('button', { name: 'Upload 2 tests' })).toBeEnabled();
    await user.click(screen.getByRole('switch', { name: /replace existing tests/i }));
    expect(screen.getByText('Existing tests will be deleted')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace with 2 tests' }));

    await waitFor(() => expect(api.requests.some((r) => r.method === 'POST')).toBe(true));
    const post = api.requests.find((r) => r.method === 'POST');
    expect(post?.body).toEqual({
      replace: true,
      tests: [
        { input: '1 2\n', expectedOutput: '3\n', isSample: false },
        { input: '5 6\n', expectedOutput: '11\n', isSample: false },
      ],
    });
  });

  it('appends by default and marks the first N pairs as samples', async () => {
    const api = mockFetch({
      'POST /api/admin/problems/p1/tests/bulk': () => jsonResponse(200, { created: 2, total: 6 }),
    });
    const user = userEvent.setup();
    renderDialog(4);

    await user.upload(screen.getByLabelText('Test files'), [
      file('1.in', 'a'),
      file('1.out', 'b'),
      file('2.in', 'c'),
      file('2.out', 'd'),
    ]);
    await user.clear(screen.getByLabelText('Samples'));
    await user.type(screen.getByLabelText('Samples'), '1');
    await user.click(screen.getByRole('button', { name: 'Upload 2 tests' }));

    await waitFor(() => expect(api.requests.some((r) => r.method === 'POST')).toBe(true));
    expect(api.requests.find((r) => r.method === 'POST')?.body).toEqual({
      replace: false,
      tests: [
        { input: 'a', expectedOutput: 'b', isSample: true },
        { input: 'c', expectedOutput: 'd', isSample: false },
      ],
    });
  });

  it('keeps Upload disabled until at least one pair exists', async () => {
    const user = userEvent.setup();
    renderDialog(0);
    expect(screen.getByRole('button', { name: /^Upload/ })).toBeDisabled();
    await user.upload(screen.getByLabelText('Test files'), [file('1.in', 'a')]);
    expect(screen.getByRole('button', { name: /^Upload/ })).toBeDisabled();
    expect(screen.getByRole('list', { name: 'Unpaired files' })).toHaveTextContent('1.in');
  });
});
