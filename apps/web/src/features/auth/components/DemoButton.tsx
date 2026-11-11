import { Play } from 'lucide-react';
import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { config } from '@/lib/config';
import { toastError } from '@/lib/toast';
import { useAuth } from '@/stores/auth';

export interface DemoButtonProps extends Pick<
  ButtonProps,
  'variant' | 'size' | 'fullWidth' | 'className'
> {
  /** Runs after the demo session is established (the guest-only pages redirect by themselves). */
  onSuccess?: () => void;
}

/** "Try the demo": one-click login as the demo user. Renders nothing unless config.demoLogin (R4). */
export function DemoButton({ onSuccess, variant = 'secondary', ...props }: DemoButtonProps) {
  const loginDemo = useAuth((state) => state.loginDemo);
  const [pending, setPending] = useState(false);
  if (!config.demoLogin) return null;

  const run = async () => {
    setPending(true);
    try {
      await loginDemo();
      onSuccess?.();
    } catch (error) {
      toastError(error, 'Could not start the demo');
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant={variant}
      leftIcon={<Play />}
      loading={pending}
      onClick={() => void run()}
      {...props}
    >
      Try the demo
    </Button>
  );
}
