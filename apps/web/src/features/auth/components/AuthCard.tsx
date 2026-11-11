import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

/** Framed container shared by the login and registration forms. */
export function AuthCard({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">{children}</Card>
      <p className="text-center text-sm text-muted">{footer}</p>
    </div>
  );
}
