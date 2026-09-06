import { useCallback, useRef, useState } from 'react';
import apiClient, { extractErrorMessage } from '../api/client';
import type { StudentLookupSummary } from '../types';

/**
 * Not cached like {@link useTeacherGrades} — a lookup is a one-off check
 * against whatever the teacher just typed, not data multiple pages read.
 */
export function useTeacherStudentLookup() {
  const [result, setResult] = useState<StudentLookupSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Guards against an earlier, slower lookup overwriting a later one's
  // result if responses arrive out of order.
  const requestId = useRef(0);

  const lookup = useCallback(async (query: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<StudentLookupSummary>('/teacher/students/lookup', {
        params: { query },
      });
      if (id !== requestId.current) return;
      setResult(response.data);
    } catch (err) {
      if (id !== requestId.current) return;
      setResult(null);
      setError(extractErrorMessage(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    requestId.current += 1;
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { result, error, loading, lookup, reset };
}
