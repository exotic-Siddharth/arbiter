import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, IconButton } from './Button';
import type { ButtonSize, ButtonVariant } from './button-styles';

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy failed');
}

export interface CopyButtonProps {
  text: string;
  /** Accessible label / tooltip, e.g. "Copy input". */
  label?: string;
  /** Visible text next to the icon (icon-only when omitted). */
  children?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** Copies `text` to the clipboard; the icon turns into a check for 1.5 s ("Copied" is announced). */
export function CopyButton({
  text,
  label = 'Copy',
  children,
  variant = 'ghost',
  size = 'sm',
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = async () => {
    try {
      await copyText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  const icon = copied ? <Check className="text-success" /> : <Copy />;
  return (
    <>
      {children ? (
        <Button
          variant={variant}
          size={size}
          leftIcon={icon}
          onClick={onCopy}
          className={className}
        >
          {copied ? 'Copied' : children}
        </Button>
      ) : (
        <IconButton
          label={copied ? 'Copied' : label}
          icon={icon}
          variant={variant}
          size={size}
          onClick={onCopy}
          className={className}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </>
  );
}
