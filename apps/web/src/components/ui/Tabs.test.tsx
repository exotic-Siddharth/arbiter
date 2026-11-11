import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

function Example({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('description');
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    >
      <TabsList aria-label="Problem">
        <TabsTrigger value="description">Description</TabsTrigger>
        <TabsTrigger value="submissions">My submissions</TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Disabled
        </TabsTrigger>
        <TabsTrigger value="hints">Hints</TabsTrigger>
      </TabsList>
      <TabsContent value="description">Statement text</TabsContent>
      <TabsContent value="submissions">Submissions table</TabsContent>
      <TabsContent value="hints">Hint list</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('wires tabs and panels with ARIA', () => {
    render(<Example />);
    const tab = screen.getByRole('tab', { name: 'Description' });
    expect(screen.getByRole('tablist', { name: 'Problem' })).toBeInTheDocument();
    expect(tab).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Statement text');
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(screen.queryByText('Submissions table')).not.toBeInTheDocument();
  });

  it('uses a roving tabindex and arrow keys, skipping disabled tabs', async () => {
    const user = userEvent.setup();
    render(<Example />);
    expect(screen.getByRole('tab', { name: 'My submissions' })).toHaveAttribute('tabindex', '-1');

    await user.tab();
    expect(screen.getByRole('tab', { name: 'Description' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'My submissions' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'My submissions' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Submissions table');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Hints' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Description' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Hints' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Description' })).toHaveFocus();
  });

  it('activates a tab on click', async () => {
    const user = userEvent.setup();
    const changes: string[] = [];
    render(<Example onChange={(value) => changes.push(value)} />);
    await user.click(screen.getByRole('tab', { name: 'Hints' }));
    expect(changes).toEqual(['hints']);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Hint list');
  });

  it('works uncontrolled with defaultValue', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="b">
        <TabsList aria-label="Letters">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel B');
    await user.click(screen.getByRole('tab', { name: 'A' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel A');
  });
});
