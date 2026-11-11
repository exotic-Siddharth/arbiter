import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SandboxSection } from './SandboxSection';

describe('SandboxSection', () => {
  it('states the capability set that sandbox.ts really keeps', () => {
    const { container } = render(<SandboxSection />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/No Linux capabilities/);
    expect(text).toContain('--cap-add SETUID --cap-add SETGID --cap-add KILL');
    expect(screen.getByText(/runs with none/i)).toBeInTheDocument();
    expect(text).toContain('--tmpfs /tmp');
  });
});
