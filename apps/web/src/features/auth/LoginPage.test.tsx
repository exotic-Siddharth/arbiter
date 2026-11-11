import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { useAuth } from '@/stores/auth';

const mockConfig = vi.hoisted(() => ({ demoLogin: false, appName: 'Arbiter' }));
vi.mock('@/lib/config', () => ({ config: mockConfig }));

import { Component as LoginPage } from './LoginPage';

const me = {
  id: 'u1',
  username: 'demo',
  email: 'demo@example.com',
  role: 'USER',
  rating: 1200,
  bio: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('LoginPage', () => {
  beforeEach(() => {
    mockConfig.demoLogin = false;
  });

  it('hides "Try the demo" unless config.demoLogin is true', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.queryByRole('button', { name: /try the demo/i })).not.toBeInTheDocument();
  });

  it('shows "Try the demo" when enabled and logs in through loginDemo()', async () => {
    mockConfig.demoLogin = true;
    const api = mockFetch({
      'POST /api/auth/demo': () => jsonResponse(200, { user: me, accessToken: 'tok' }),
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /try the demo/i }));
    await waitFor(() => expect(useAuth.getState().user?.username).toBe('demo'));
    expect(api.requests[0]?.path).toBe('/api/auth/demo');
  });

  it('shows inline schema errors and does not call the API', async () => {
    const api = mockFetch({});
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await user.click(screen.getByRole('button', { name: /^log in$/i }));
    expect(await screen.findByText('Enter your email or username')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(api.requests).toHaveLength(0);
  });

  it('shows a rejected login as a form alert', async () => {
    mockFetch({
      'POST /api/auth/login': () => apiError(401, 'UNAUTHORIZED', 'Invalid credentials'),
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText(/email or username/i), 'ada');
    await user.type(screen.getByLabelText(/^password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });

  it('declares autocomplete attributes', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText(/email or username/i)).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('autocomplete', 'current-password');
  });
});
