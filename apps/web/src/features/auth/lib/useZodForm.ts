import { useCallback, useState } from 'react';
import type { z } from 'zod';

type Errors<K extends string> = Partial<Record<K, string>>;

/**
 * Minimal form state driven by a shared zod object schema: values, per-field errors (first
 * message per field), validation on blur and submit, and server field errors merged in.
 */
export function useZodForm<K extends string, Out>(
  schema: z.ZodType<Out, z.ZodTypeDef, Record<K, string>>,
  initial: Record<K, string>,
  fieldIds: Record<K, string>,
) {
  const [values, setValues] = useState<Record<K, string>>(initial);
  const [errors, setErrors] = useState<Errors<K>>({});

  const check = useCallback(
    (next: Record<K, string>): { data: Out | null; errors: Errors<K> } => {
      const result = schema.safeParse(next);
      if (result.success) return { data: result.data, errors: {} };
      const found: Errors<K> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as K | undefined;
        if (key !== undefined && !(key in found)) found[key] = issue.message;
      }
      return { data: null, errors: found };
    },
    [schema],
  );

  const setField = useCallback((key: K, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    // Editing clears the stale message (server or schema); blur and submit validate again.
    setErrors((current) =>
      current[key] === undefined ? current : { ...current, [key]: undefined },
    );
  }, []);

  const blurField = useCallback(
    (key: K) => {
      // Only complain on blur once the user typed something; empty required fields wait for submit.
      if (values[key] === '') return;
      const message = check(values).errors[key];
      setErrors((current) => ({ ...current, [key]: message }));
    },
    [check, values],
  );

  /** Validates everything; returns the parsed data, or null after setting the errors. */
  const validate = useCallback((): Out | null => {
    const { data, errors: found } = check(values);
    setErrors(found);
    const first = (Object.keys(fieldIds) as K[]).find((key) => found[key] !== undefined);
    if (first) document.getElementById(fieldIds[first])?.focus();
    return data;
  }, [check, fieldIds, values]);

  const setServerErrors = useCallback((next: Errors<K>) => {
    setErrors((current) => ({ ...current, ...next }));
  }, []);

  return { values, errors, setField, blurField, validate, setServerErrors };
}
