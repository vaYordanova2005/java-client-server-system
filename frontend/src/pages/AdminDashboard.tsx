import { Fragment, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import apiClient, { extractErrorMessage } from '../api/client';
import { Layout } from '../routes/Layout';
import { useAuth } from '../auth/useAuth';
import { useAuditLog, type AuditLogFilters } from '../hooks/useAuditLog';
import { ConfirmDeleteButton } from '../components/ConfirmDeleteButton';
import type { Role, StudentProfileSummary, UserSummary } from '../types';

type ProfileFormState = {
  degreeLevel: string;
  facultyNumber: string;
  faculty: string;
  specialty: string;
  studyMode: string;
  specialization: string;
  groupNumber: string;
  admissionType: string;
  status: string;
  enrolledSemester: string;
  completedSemester: string;
  stream: string;
};

const PROFILE_FIELD_LABELS: { key: keyof ProfileFormState; label: string; type?: string }[] = [
  { key: 'degreeLevel', label: 'ОКС' },
  { key: 'facultyNumber', label: 'Фак. номер' },
  { key: 'faculty', label: 'Факултет' },
  { key: 'specialty', label: 'Специалност' },
  { key: 'studyMode', label: 'Вид обучение' },
  { key: 'specialization', label: 'Специализация' },
  { key: 'groupNumber', label: 'Група' },
  { key: 'admissionType', label: 'Вид прием' },
  { key: 'status', label: 'Състояние' },
  { key: 'enrolledSemester', label: 'Записан семестър', type: 'number' },
  { key: 'completedSemester', label: 'Заверен семестър', type: 'number' },
  { key: 'stream', label: 'Поток' },
];

function toFormState(profile: StudentProfileSummary): ProfileFormState {
  return {
    degreeLevel: profile.degreeLevel ?? '',
    facultyNumber: profile.facultyNumber ?? '',
    faculty: profile.faculty ?? '',
    specialty: profile.specialty ?? '',
    studyMode: profile.studyMode ?? '',
    specialization: profile.specialization ?? '',
    groupNumber: profile.groupNumber ?? '',
    admissionType: profile.admissionType ?? '',
    status: profile.status ?? '',
    enrolledSemester: profile.enrolledSemester != null ? String(profile.enrolledSemester) : '',
    completedSemester: profile.completedSemester != null ? String(profile.completedSemester) : '',
    stream: profile.stream ?? '',
  };
}

export function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [role, setRole] = useState<Role>('STUDENT');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [auditEventType, setAuditEventType] = useState('');
  const [auditInvolving, setAuditInvolving] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const auditFilters: AuditLogFilters = useMemo(
    () => ({ eventType: auditEventType || undefined, involving: auditInvolving || undefined }),
    [auditEventType, auditInvolving]
  );
  const { result: auditResult, error: auditError, loading: auditLoading } = useAuditLog(auditFilters, auditPage);

  const [profileUsername, setProfileUsername] = useState('');
  const [profileForm, setProfileForm] = useState<ProfileFormState | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  // The list is refetched by bumping this rather than by calling a loader
  // function from the effect: a loader that sets state synchronously makes
  // React render twice on mount, and a late response could overwrite a newer
  // one — the `ignore` flag below rules that out.
  const [usersToken, setUsersToken] = useState(0);
  const reloadUsers = () => setUsersToken((token) => token + 1);

  // Which row currently has a status call in flight, so only that row's
  // buttons are disabled rather than the whole table.
  const [statusPendingId, setStatusPendingId] = useState<number | null>(null);

  const handleToggleStatus = async (target: UserSummary) => {
    setError(null);
    setStatusPendingId(target.id);
    try {
      await apiClient.put(`/admin/users/${target.id}/status`, { enabled: !target.enabled });
      reloadUsers();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setStatusPendingId(null);
    }
  };

  // Delete confirm/pending state, same shape as ConfirmDeleteButton's other
  // usages (JournalPage/StudentsPage), plus a dedicated error slot since a
  // blocked delete (409, has grade/calendar history) is a routine, expected
  // outcome the admin needs to see inline, not just in the shared banner.
  const [deleteConfirmingId, setDeleteConfirmingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleRequestDelete = (id: number) => {
    setDeleteError(null);
    setDeleteConfirmingId(id);
  };
  const handleCancelDelete = () => setDeleteConfirmingId(null);
  const handleConfirmDelete = async (id: number) => {
    setDeleteError(null);
    setDeletingId(id);
    try {
      await apiClient.delete(`/admin/users/${id}`);
      setDeleteConfirmingId(null);
      reloadUsers();
    } catch (err) {
      setDeleteError(extractErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const [resetPasswordForId, setResetPasswordForId] = useState<number | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordSubmitting, setResetPasswordSubmitting] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null);

  const startResetPassword = (id: number) => {
    setResetPasswordForId(id);
    setResetPasswordValue('');
    setResetPasswordError(null);
    setResetPasswordSuccess(null);
  };
  const cancelResetPassword = () => setResetPasswordForId(null);

  const handleResetPassword = async (event: FormEvent, target: UserSummary) => {
    event.preventDefault();
    setResetPasswordError(null);
    setResetPasswordSubmitting(true);
    try {
      await apiClient.post(`/admin/users/${target.id}/reset-password`, { newPassword: resetPasswordValue });
      setResetPasswordSuccess(`Паролата на ${target.username} е сменена`);
      setResetPasswordForId(null);
      setResetPasswordValue('');
    } catch (err) {
      setResetPasswordError(extractErrorMessage(err));
    } finally {
      setResetPasswordSubmitting(false);
    }
  };

  const handleUnlock = async (target: UserSummary) => {
    setError(null);
    setStatusPendingId(target.id);
    try {
      await apiClient.post(`/admin/users/${target.id}/unlock`);
      reloadUsers();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setStatusPendingId(null);
    }
  };

  useEffect(() => {
    let ignore = false;
    apiClient.get<UserSummary[]>('/admin/users').then(
      (response) => {
        if (ignore) return;
        setUsers(response.data);
        setLoading(false);
      },
      (err) => {
        if (ignore) return;
        setError(extractErrorMessage(err));
        setLoading(false);
      }
    );
    return () => {
      ignore = true;
    };
  }, [usersToken]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post('/admin/users', { role, username, password });
      setUsername('');
      setPassword('');
      reloadUsers();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setProfileForm(null);
    setProfileLoading(true);
    try {
      const response = await apiClient.get<StudentProfileSummary>('/admin/students/profile', {
        params: { username: profileUsername },
      });
      setProfileForm(toFormState(response.data));
    } catch (err) {
      setProfileError(extractErrorMessage(err));
    } finally {
      setProfileLoading(false);
    }
  };

  const updateProfileField = (field: keyof ProfileFormState) => (event: ChangeEvent<HTMLInputElement>) => {
    setProfileForm((prev) => (prev ? { ...prev, [field]: event.target.value } : prev));
  };

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profileForm) return;
    setProfileError(null);
    setProfileSuccess(null);
    setProfileSaving(true);
    try {
      await apiClient.put('/admin/students/profile', {
        studentUsername: profileUsername,
        degreeLevel: profileForm.degreeLevel || null,
        facultyNumber: profileForm.facultyNumber || null,
        faculty: profileForm.faculty || null,
        specialty: profileForm.specialty || null,
        studyMode: profileForm.studyMode || null,
        specialization: profileForm.specialization || null,
        groupNumber: profileForm.groupNumber || null,
        admissionType: profileForm.admissionType || null,
        status: profileForm.status || null,
        enrolledSemester: profileForm.enrolledSemester ? Number(profileForm.enrolledSemester) : null,
        completedSemester: profileForm.completedSemester ? Number(profileForm.completedSemester) : null,
        stream: profileForm.stream || null,
      });
      setProfileSuccess('Профилът е записан');
    } catch (err) {
      setProfileError(extractErrorMessage(err));
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <Layout title="Admin">
      <section className="card">
        <h2>Нов потребител</h2>
        <form onSubmit={handleSubmit} className="inline-form">
          <label>
            Роля
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="STUDENT">Студент</option>
              <option value="TEACHER">Учител</option>
            </select>
          </label>
          <label>
            {role === 'TEACHER' ? 'Имейл (@uni-sofia.bg)' : 'Имейл'}
            <input
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Парола (мин. 5 символа)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Създаване...' : 'Създай'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>Профил на студент</h2>
        <form onSubmit={handleLoadProfile} className="inline-form">
          <label>
            Имейл на студента
            <input
              type="email"
              value={profileUsername}
              onChange={(e) => setProfileUsername(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={profileLoading}>
            {profileLoading ? 'Зареждане...' : 'Зареди'}
          </button>
        </form>
        {profileError && <p className="error">{profileError}</p>}

        {profileForm && (
          <form onSubmit={handleSaveProfile} className="profile-edit-grid">
            {PROFILE_FIELD_LABELS.map(({ key, label, type }) => (
              <label key={key}>
                {label}
                <input type={type ?? 'text'} value={profileForm[key]} onChange={updateProfileField(key)} />
              </label>
            ))}
            <button type="submit" disabled={profileSaving}>
              {profileSaving ? 'Записване...' : 'Запази'}
            </button>
          </form>
        )}
        {profileSuccess && <p className="success">{profileSuccess}</p>}
      </section>

      <section className="card">
        <h2>Потребители</h2>
        {loading ? (
          <p>Зареждане...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Потребителско име</th>
                <th>Роля</th>
                <th>Статус</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.role}</td>
                    <td>
                      {!u.enabled ? 'Деактивиран' : u.locked ? 'Временно заключен' : 'Активен'}
                    </td>
                    <td className="user-actions">
                      {u.username !== user?.username && (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u)}
                          disabled={statusPendingId === u.id}
                        >
                          {u.enabled ? 'Деактивирай' : 'Активирай'}
                        </button>
                      )}
                      {u.locked && u.enabled && (
                        <button
                          type="button"
                          onClick={() => handleUnlock(u)}
                          disabled={statusPendingId === u.id}
                        >
                          Отключи
                        </button>
                      )}
                      {u.username !== user?.username && (
                        <button type="button" onClick={() => startResetPassword(u.id)}>
                          Смени парола
                        </button>
                      )}
                      {u.username !== user?.username && (
                        <ConfirmDeleteButton
                          id={u.id}
                          confirmingDeleteId={deleteConfirmingId}
                          deletingId={deletingId}
                          onRequestDelete={handleRequestDelete}
                          onCancelDelete={handleCancelDelete}
                          onConfirmDelete={handleConfirmDelete}
                        />
                      )}
                    </td>
                  </tr>
                  {(deleteConfirmingId === u.id || resetPasswordForId === u.id) && (
                    <tr>
                      <td colSpan={5}>
                        {deleteConfirmingId === u.id && (
                          <p className="error">
                            {u.role === 'STUDENT'
                              ? 'Изтриването премахва и регистрационния профил на студента — факултетният номер ще стане свободен за повторно ползване.'
                              : 'Това действие е необратимо.'}
                          </p>
                        )}
                        {resetPasswordForId === u.id && (
                          <form className="inline-form" onSubmit={(e) => handleResetPassword(e, u)}>
                            <label>
                              Нова парола
                              <input
                                type="password"
                                value={resetPasswordValue}
                                onChange={(e) => setResetPasswordValue(e.target.value)}
                                required
                              />
                            </label>
                            <button type="submit" disabled={resetPasswordSubmitting}>
                              {resetPasswordSubmitting ? 'Записване...' : 'Смени'}
                            </button>
                            <button type="button" onClick={cancelResetPassword}>
                              Отказ
                            </button>
                          </form>
                        )}
                        {resetPasswordForId === u.id && resetPasswordError && (
                          <p className="error">{resetPasswordError}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        {deleteError && <p className="error">{deleteError}</p>}
        {resetPasswordSuccess && <p className="success">{resetPasswordSuccess}</p>}
      </section>

      <section className="card">
        <h2>Одит лог</h2>
        <form className="inline-form" onSubmit={(e) => e.preventDefault()}>
          <label>
            Тип събитие
            <input
              value={auditEventType}
              onChange={(e) => {
                setAuditEventType(e.target.value);
                setAuditPage(0);
              }}
              placeholder="напр. ACCOUNT_STATUS_CHANGED"
            />
          </label>
          <label>
            Участник (извършил или засегнат)
            <input
              value={auditInvolving}
              onChange={(e) => {
                setAuditInvolving(e.target.value);
                setAuditPage(0);
              }}
              placeholder="имейл"
            />
          </label>
        </form>
        {auditLoading && <p>Зареждане...</p>}
        {auditError && <p className="error">{auditError}</p>}
        {!auditLoading && !auditError && (
          <>
            {auditResult.content.length === 0 ? (
              <p>Няма събития, отговарящи на филтъра.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Тип</th>
                    <th>Извършено от</th>
                    <th>Засяга</th>
                    <th>IP</th>
                    <th>Детайли</th>
                  </tr>
                </thead>
                <tbody>
                  {auditResult.content.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.createdAt).toLocaleString('bg-BG')}</td>
                      <td>{entry.eventType}</td>
                      <td>{entry.actorUsername ?? '—'}</td>
                      <td>{entry.targetUsername ?? '—'}</td>
                      <td>{entry.ip ?? '—'}</td>
                      <td>{entry.detail ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="user-actions">
              <button type="button" disabled={auditPage === 0} onClick={() => setAuditPage((p) => p - 1)}>
                Предишна
              </button>
              <span>
                Страница {auditResult.page + 1} от {Math.max(auditResult.totalPages, 1)}
              </span>
              <button
                type="button"
                disabled={auditPage + 1 >= auditResult.totalPages}
                onClick={() => setAuditPage((p) => p + 1)}
              >
                Следваща
              </button>
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}
