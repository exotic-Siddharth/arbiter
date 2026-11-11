import { RegisterBody } from '@arbiter/shared';
import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Page } from '@/components/layout/Page';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fieldErrors, getErrorMessage, isApiError } from '@/lib/api';
import { config } from '@/lib/config';
import { cn } from '@/lib/cn';
import { loginHref } from '@/lib/url';
import { useAuth } from '@/stores/auth';
import { DemoButton } from './components/DemoButton';
import { AuthCard } from './components/AuthCard';
import { OrDivider } from './components/OrDivider';
import { PasswordInput } from './components/PasswordInput';
import { useZodForm } from './lib/useZodForm';

const FIELD_IDS = {
  email: 'register-email',
  username: 'register-username',
  password: 'register-password',
};
const INITIAL = { email: '', username: '', password: '' };
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

type Field = keyof typeof FIELD_IDS;

/** Which field a 409 belongs to: details.field when the API names it, else guessed from the message. */
function conflictField(error: unknown): Field {
  if (isApiError(error)) {
    const named = (error.details as { field?: unknown } | null | undefined)?.field;
    if (named === 'email' || named === 'username') return named;
    if (/e-?mail/i.test(error.message)) return 'email';
  }
  return 'username';
}

export function Component() {
  const register = useAuth((state) => state.register);
  const [params] = useSearchParams();
  const next = params.get('next') ?? undefined;
  const form = useZodForm(RegisterBody, INITIAL, FIELD_IDS);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const length = form.values.password.length;
  const passwordOk = length >= PASSWORD_MIN && length <= PASSWORD_MAX;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const data = form.validate();
    if (!data) return;
    setPending(true);
    try {
      // GuestOnly redirects to ?next= (or home) as soon as the session exists.
      await register(data);
    } catch (error) {
      const fields = fieldErrors(error);
      if (isApiError(error) && error.status === 409) {
        form.setServerErrors({ [conflictField(error)]: error.message });
      } else if (fields.email || fields.username || fields.password) {
        form.setServerErrors({
          email: fields.email,
          username: fields.username,
          password: fields.password,
        });
      } else {
        setFormError(getErrorMessage(error));
      }
      setPending(false);
    }
  };

  return (
    <Page
      title="Create your account"
      documentTitle="Sign up"
      description="Solve problems, climb the rating ladder and compete in live contests."
      width="narrow"
    >
      <AuthCard
        footer={
          <>
            Already have an account?{' '}
            <Link to={loginHref(next)} className="font-medium text-primary-text hover:underline">
              Log in
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
            id={FIELD_IDS.email}
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={form.values.email}
            error={form.errors.email}
            onChange={(event) => form.setField('email', event.target.value)}
            onBlur={() => form.blurField('email')}
          />
          <Input
            id={FIELD_IDS.username}
            label="Username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            hint="3 to 20 letters, digits or underscores. Shown on the leaderboard."
            value={form.values.username}
            error={form.errors.username}
            onChange={(event) => form.setField('username', event.target.value)}
            onBlur={() => form.blurField('username')}
          />
          <PasswordInput
            id={FIELD_IDS.password}
            label="Password"
            name="password"
            autoComplete="new-password"
            hint={
              <span
                className={cn('inline-flex items-center gap-1.5', passwordOk && 'text-success')}
              >
                <Check aria-hidden="true" className={cn('size-3.5', !passwordOk && 'opacity-40')} />
                {PASSWORD_MIN} to {PASSWORD_MAX} characters
              </span>
            }
            value={form.values.password}
            error={form.errors.password}
            onChange={(event) => form.setField('password', event.target.value)}
            onBlur={() => form.blurField('password')}
          />
          <Button type="submit" fullWidth loading={pending}>
            Create account
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
