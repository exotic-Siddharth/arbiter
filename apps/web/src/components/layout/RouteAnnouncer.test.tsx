import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { RouteAnnouncer } from './RouteAnnouncer';

function PageA() {
  useDocumentTitle('Problems');
  return <Link to="/b">go b</Link>;
}
function PageB() {
  useDocumentTitle('Two Sum');
  return <Link to="/b?page=2">next page</Link>;
}

function Shell() {
  const mainRef = useRef<HTMLElement>(null);
  return (
    <>
      <main id="main" tabIndex={-1} ref={mainRef}>
        <Routes>
          <Route path="/a" element={<PageA />} />
          <Route path="/b" element={<PageB />} />
        </Routes>
      </main>
      <RouteAnnouncer mainRef={mainRef} />
    </>
  );
}

describe('RouteAnnouncer', () => {
  it('does not move focus on the first render', () => {
    render(
      <MemoryRouter initialEntries={['/a']}>
        <Shell />
      </MemoryRouter>,
    );
    expect(document.body).toHaveFocus();
  });

  it('moves focus to main and announces the title after a path change', async () => {
    render(
      <MemoryRouter initialEntries={['/a']}>
        <Shell />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('link', { name: 'go b' }));
    expect(document.getElementById('main')).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Two Sum'));
  });

  it('leaves focus alone when only the query string changes', async () => {
    render(
      <MemoryRouter initialEntries={['/b']}>
        <Shell />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'next page' });
    await userEvent.click(link);
    expect(link).toHaveFocus();
  });
});
