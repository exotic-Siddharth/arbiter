import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { Component as RegisterPage } from './RegisterPage';

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  username: string,
  password: string,
) {
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/username/i), username);
  await user.type(screen.getByLabelText(/^password/i), password);
}

describe('RegisterPage', () => {
  it('shows server 409 message inline', async () => {
    const api = mockFetch({
      'POST /api/auth/register': () =>
        apiError(409, 'CONFLICT', 'Username already taken', { field: 'username' }),
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fill(user, 'ada@example.com', 'ada_l', 'correct horse');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    const field = await screen.findByLabelText(/username/i);
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('Username already taken')).toBeInTheDocument();
    expect(field).toHaveAccessibleDescription(/Username already taken/);
    expect(api.requests).toHaveLength(1);
  });

  it('puts an email conflict on the email field', async () => {
    mockFetch({
      'POST /api/auth/register': () => apiError(409, 'CONFLICT', 'Email is already registered'),
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fill(user, 'ada@example.com', 'ada_l', 'correct horse');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByText('Email is already registered');
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/username/i)).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('validates with the shared schema before sending', async () => {
    const api = mockFetch({
      'POST /api/auth/register': () => jsonResponse(500, {}),
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fill(user, 'not-an-email', 'a!', 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Username must be at least 3 characters')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(api.requests).toHaveLength(0);
  });

  it('maps VALIDATION_ERROR details onto fields', async () => {
    mockFetch({
      'POST /api/auth/register': () =>
        apiError(400, 'VALIDATION_ERROR', 'Invalid request', [
          { location: 'body', path: 'username', message: 'Username is reserved', code: 'custom' },
        ]),
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fill(user, 'ada@example.com', 'admin', 'correct horse');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Username is reserved')).toBeInTheDocument();
  });

  it('declares autocomplete attributes', () => {
    renderWithProviders(<RegisterPage />);
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText(/username/i)).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('autocomplete', 'new-password');
  });
});
