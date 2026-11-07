import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, MenuItem, MenuLink, MenuSeparator } from './DropdownMenu';

function renderMenu(onDelete = vi.fn()) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <DropdownMenu trigger="Actions" triggerLabel="Problem actions">
            <MenuLink to="/admin/problems/p1">Edit</MenuLink>
            <MenuItem onSelect={() => {}} disabled>
              Archive
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={onDelete} tone="danger">
              Delete
            </MenuItem>
          </DropdownMenu>
        ),
      },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  return { router, onDelete };
}

describe('DropdownMenu', () => {
  it('opens from the keyboard, moves with arrows and skips disabled items', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Problem actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Problem actions' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Problem actions' });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('runs the selected action and closes', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Problem actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('navigates through link items', async () => {
    const user = userEvent.setup();
    const { router } = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Problem actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/problems/p1'));
  });

  it('closes when clicking outside', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Problem actions' }));
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
