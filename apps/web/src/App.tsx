import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';
import { AppToaster } from '@/components/layout/AppToaster';
import { queryClient } from '@/lib/queryClient';
import { createAppRouter } from './router';

const router = createAppRouter();

/** Providers + router. Auth bootstrap and query/auth wiring happen in main.tsx. */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <AppToaster />
    </QueryClientProvider>
  );
}
