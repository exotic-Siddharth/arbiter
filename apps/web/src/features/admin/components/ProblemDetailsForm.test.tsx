import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { renderWithProviders } from '@/test/render';
import { adminProblem, adminUser } from '../test/fixtures';
import { problemReference, problemToForm } from '../lib/problemForm';
import { ProblemDetailsForm } from './ProblemDetailsForm';

// What the API sends for a duplicate slug (Prisma P2002 via the error middleware).
const slugTaken = () =>
  new ApiError({
    status: 409,
    code: 'CONFLICT',
    message: 'A record with this value already exists',
    details: { target: ['slug'] },
  });
const noTests = () =>
  new ApiError({
    status: 409,
    code: 'CONFLICT',
    message: 'A problem needs at least one test case before it can be published',
  });

function renderExisting(onSave: () => Promise<void>, testCount = 2) {
  const problem = adminProblem({ testCount });
  renderWithProviders(
    <ProblemDetailsForm
      initial={problemToForm(problem)}
      reference={problemReference(problem)}
      isNew={false}
      testCount={testCount}
      onSave={onSave}
    />,
    { user: adminUser },
  );
}

describe('ProblemDetailsForm 409 handling and publishing (A-R2-11)', () => {
  it('shows a 409 that is not about the slug as the server message, slug untouched', async () => {
    const user = userEvent.setup();
    renderExisting(vi.fn().mockRejectedValue(noTests()));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/needs at least one test case/)).toBeInTheDocument();
    expect(screen.queryByText(/already used by another problem/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Slug/)).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('maps a slug conflict (details.target) to the slug field', async () => {
    const user = userEvent.setup();
    renderExisting(vi.fn().mockRejectedValue(slugTaken()));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/already used by another problem/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Slug/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables Published, with a hint, while the problem has no tests (create included)', () => {
    renderWithProviders(
      <ProblemDetailsForm reference={problemReference(undefined)} isNew onSave={vi.fn()} />,
      { user: adminUser },
    );
    expect(screen.getByRole('switch', { name: 'Published' })).toBeDisabled();
    expect(screen.getByText(/add at least one test case before publishing/i)).toBeInTheDocument();
  });

  it('disables Published for an existing problem without tests', () => {
    renderExisting(vi.fn(), 0);
    expect(screen.getByRole('switch', { name: 'Published' })).toBeDisabled();
  });

  it('enables Published once the problem has tests', () => {
    renderExisting(vi.fn(), 3);
    expect(screen.getByRole('switch', { name: 'Published' })).toBeEnabled();
  });
});
