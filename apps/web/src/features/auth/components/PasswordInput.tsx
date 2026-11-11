import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/ui/Button';
import { Input, type InputProps } from '@/components/ui/Input';

/** Password field with a show/hide toggle (never type="text" by default). */
export function PasswordInput(props: Omit<InputProps, 'type' | 'rightSlot'>) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      spellCheck={false}
      autoCapitalize="none"
      rightSlot={
        <IconButton
          label={visible ? 'Hide password' : 'Show password'}
          icon={visible ? <EyeOff /> : <Eye />}
          size="sm"
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        />
      }
    />
  );
}
