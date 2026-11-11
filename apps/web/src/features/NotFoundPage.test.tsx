import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { Component as NotFoundPage } from './NotFoundPage';

describe('NotFoundPage', () => {
  it('names the missing path, links home and sets the title', () => {
    renderWithProviders(<NotFoundPage />, { route: '/no/such/page' });
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText('/no/such/page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Arbiter' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /browse problems/i })).toHaveAttribute(
      'href',
      '/problems',
    );
    expect(document.title).toBe('Page not found · Arbiter');
  });
});
