import { LoginBody } from '@arbiter/shared';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Page } from '@/components/layout/Page';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { config } from '@/lib/config';
import { fieldErrors, getErrorMessage } from '@/lib/api';
import { registerHref } from '@/lib/url';
import { useAuth } from '@/stores/auth';
import { AuthCard } from './components/AuthCard';
import { OrDivider } from './components/OrDivider';
import { DemoButton } from './components/DemoButton';
import { PasswordInput } from './components/PasswordInput';
import { useZodForm } from './lib/useZodForm';

const FIELD_IDS = { identifier: 'login-identifier', password: 'login-password' };
const INITIAL = { identifier: '', password: '' };

export function Component() {
  const login = useAuth((state) => state.login);
  const [params] = useSearchParams();
  const next = params.get('next') ?? undefined;
  const form = useZodForm(LoginBody, INITIAL, FIELD_IDS);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const data = form.validate();
    if (!data) return;
    setPending(true);
    try {
      // GuestOnly redirects to ?next= (or home) as soon as the session exists.
      await login(data.identifier, data.password);
    } catch (error) {
      const fields = fieldErrors(error);
      if (fields.identifier || fields.password) {
        form.setServerErrors({ identifier: fields.identifier, password: fields.password });
      } else {
        setFormError(getErrorMessage(error));
      }
      setPending(false);
    }
  };

  return (
    <Page
      title="Log in"
      description="Welcome back. Log in to submit solutions and join contests."
      width="narrow"
    >
      <AuthCard
        footer={
          <>
            New to Arbiter?{' '}
            <Link to={registerHref(next)} className="font-medium text-primary-text hover:underline">
              Create an account
            </Link>
          </>
        }
      >
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-4">
          {formError ? (
            <Alert tone="danger" role="alert">
              {formError}
            </Alert>
          ) : null}
          <Input
            id={FIELD_IDS.identifier}
            label="Email or username"
            name="identifier"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={form.values.identifier}
            error={form.errors.identifier}
            onChange={(event) => form.setField('identifier', event.target.value)}
            onBlur={() => form.blurField('identifier')}
          />
          <PasswordInput
            id={FIELD_IDS.password}
            label="Password"
            name="password"
            autoComplete="current-password"
            value={form.values.password}
            error={form.errors.password}
            onChange={(event) => form.setField('password', event.target.value)}
            onBlur={() => form.blurField('password')}
          />
          <Button type="submit" fullWidth loading={pending}>
            Log in
          </Button>
          {config.demoLogin ? (
            <>
              <OrDivider />
              <DemoButton fullWidth />
            </>
          ) : null}
        </form>
      </AuthCard>
    </Page>
  );
}

export default Component;
