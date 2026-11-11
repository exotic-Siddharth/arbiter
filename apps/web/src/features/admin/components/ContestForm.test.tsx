import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { adminContest, adminUser } from '../test/fixtures';
import { contestToForm } from '../lib/contestForm';
import { ContestForm } from './ContestForm';

describe('ContestForm for a rated contest (A-18)', () => {
  const rated = adminContest({ ratedAt: '2026-10-02T10:00:00.000Z' });

  it('locks the schedule, penalty and problems but leaves the text editable', () => {
    renderWithProviders(
      <ContestForm initial={contestToForm(rated)} isNew={false} onSave={vi.fn()} ratedLocked />,
      { user: adminUser },
    );
    expect(screen.getByLabelText(/^Starts/)).toBeDisabled();
    expect(screen.getByLabelText(/^Ends/)).toBeDisabled();
    expect(screen.getByLabelText(/^Penalty/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Add problems/ })).toBeDisabled();
    expect(screen.getByLabelText(/^Title/)).toBeEnabled();
    expect(screen.getByText(/ratings were computed/i)).toBeInTheDocument();
  });

  it('is fully editable when the contest is not rated', () => {
    renderWithProviders(
      <ContestForm initial={contestToForm(adminContest())} isNew={false} onSave={vi.fn()} />,
      { user: adminUser },
    );
    expect(screen.getByLabelText(/^Starts/)).toBeEnabled();
    expect(screen.getByRole('button', { name: /Add problems/ })).toBeEnabled();
  });

  it('shows the server message of a 409 that is not about the slug', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT',
        message: 'A rated contest keeps its times, penalty and problems',
      }),
    );
    renderWithProviders(
      <ContestForm initial={contestToForm(adminContest())} isNew={false} onSave={onSave} />,
      { user: adminUser },
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/A rated contest keeps its times/)).toBeInTheDocument();
    expect(screen.queryByText(/already used by another contest/)).not.toBeInTheDocument();
  });
});
