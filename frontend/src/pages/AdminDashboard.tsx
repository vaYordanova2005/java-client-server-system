import { Fragment, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import apiClient, { extractErrorMessage } from '../api/client';
import { Layout } from '../routes/Layout';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { useAuditLog, type AuditLogFilters } from '../hooks/useAuditLog';
import { ConfirmDeleteButton } from '../components/ConfirmDeleteButton';
import { formatDateTime } from '../utils/calendar';
import type { ImportUsersResponse, Role, StudentProfileSummary, UserSummary } from '../types';
import type { TranslationKey } from '../i18n/translations';

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

const PROFILE_FIELD_LABELS: { key: keyof ProfileFormState; labelKey: TranslationKey; type?: string }[] = [
  { key: 'degreeLevel', labelKey: 'profileFields.degreeLevel' },
  { key: 'facultyNumber', labelKey: 'profileFields.facultyNumber' },
  { key: 'faculty', labelKey: 'profileFields.faculty' },
  { key: 'specialty', labelKey: 'profileFields.specialty' },
  { key: 'studyMode', labelKey: 'profileFields.studyMode' },
  { key: 'specialization', labelKey: 'profileFields.specialization' },
  { key: 'groupNumber', labelKey: 'profileFields.groupNumber' },
  { key: 'admissionType', labelKey: 'profileFields.admissionType' },
  { key: 'status', labelKey: 'profileFields.status' },
  { key: 'enrolledSemester', labelKey: 'profileFields.enrolledSemester', type: 'number' },
  { key: 'completedSemester', labelKey: 'profileFields.completedSemester', type: 'number' },
  { key: 'stream', labelKey: 'profileFields.stream' },
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
  const { t, language } = useLanguage();
  const [role, setRole] = useState<Role>('STUDENT');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [usersPage, setUsersPage] = useState(0);
  const { result: usersResult, error: usersError, loading: usersLoading, reload: reloadUsers } = useAdminUsers(usersPage);
  const users = usersResult.content;

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
      setResetPasswordSuccess(t('admin.users.passwordChanged', { username: target.username }));
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

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportUsersResponse | null>(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!importFile) return;
    setImportError(null);
    setImportResult(null);
    setImportSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      // No manual Content-Type: the browser sets the multipart boundary
      // itself when the body is a FormData instance.
      const response = await apiClient.post<ImportUsersResponse>('/admin/users/import', formData);
      setImportResult(response.data);
      setImportFile(null);
      reloadUsers();
    } catch (err) {
      setImportError(extractErrorMessage(err));
    } finally {
      setImportSubmitting(false);
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
      setProfileSuccess(t('admin.studentProfile.saved'));
    } catch (err) {
      setProfileError(extractErrorMessage(err));
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <Layout title={t('admin.title')}>
      <section className="card">
        <h2>{t('admin.newUser.heading')}</h2>
        <form onSubmit={handleSubmit} className="inline-form">
          <label>
            {t('admin.newUser.role')}
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="STUDENT">{t('admin.newUser.roleStudent')}</option>
              <option value="TEACHER">{t('admin.newUser.roleTeacher')}</option>
            </select>
          </label>
          <label>
            {role === 'TEACHER' ? t('admin.newUser.emailTeacher') : t('admin.newUser.email')}
            <input
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            {t('admin.newUser.passwordHint')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? t('common.creating') : t('common.create')}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>{t('admin.import.heading')}</h2>
        <p>
          {t('admin.import.columnsPrefix')}
          <code>role,username,password</code>
          {t('admin.import.columnsSuffix')}
        </p>
        <form onSubmit={handleImport} className="inline-form">
          <label>
            {t('admin.import.file')}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <button type="submit" disabled={importSubmitting || !importFile}>
            {importSubmitting ? t('admin.import.uploading') : t('admin.import.upload')}
          </button>
        </form>
        {importError && <p className="error">{importError}</p>}
        {importResult && (
          <>
            <p className="success">
              {t('admin.import.createdSkipped', { created: importResult.created, skipped: importResult.skipped })}
            </p>
            {importResult.results.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.import.colRow')}</th>
                    <th>{t('admin.import.colUser')}</th>
                    <th>{t('admin.import.colResult')}</th>
                    <th>{t('admin.import.colMessage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.results.map((r) => (
                    <tr key={r.rowNumber}>
                      <td>{r.rowNumber}</td>
                      <td>{r.username}</td>
                      <td className={r.status === 'SKIPPED' ? 'error' : 'success'}>
                        {r.status === 'CREATED' ? t('admin.import.created') : t('admin.import.skipped')}
                      </td>
                      <td>{r.message ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>{t('admin.studentProfile.heading')}</h2>
        <form onSubmit={handleLoadProfile} className="inline-form">
          <label>
            {t('admin.studentProfile.emailLabel')}
            <input
              type="email"
              value={profileUsername}
              onChange={(e) => setProfileUsername(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={profileLoading}>
            {profileLoading ? t('admin.studentProfile.loading') : t('admin.studentProfile.load')}
          </button>
        </form>
        {profileError && <p className="error">{profileError}</p>}

        {profileForm && (
          <form onSubmit={handleSaveProfile} className="profile-edit-grid">
            {PROFILE_FIELD_LABELS.map(({ key, labelKey, type }) => (
              <label key={key}>
                {t(labelKey)}
                <input type={type ?? 'text'} value={profileForm[key]} onChange={updateProfileField(key)} />
              </label>
            ))}
            <button type="submit" disabled={profileSaving}>
              {profileSaving ? t('common.saving') : t('common.save')}
            </button>
          </form>
        )}
        {profileSuccess && <p className="success">{profileSuccess}</p>}
      </section>

      <section className="card">
        <h2>{t('admin.users.heading')}</h2>
        {usersLoading ? (
          <p>{t('common.loading')}</p>
        ) : usersError ? (
          <p className="error">{usersError}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('admin.users.colId')}</th>
                <th>{t('admin.users.colUsername')}</th>
                <th>{t('admin.users.colRole')}</th>
                <th>{t('admin.users.colStatus')}</th>
                <th>{t('admin.users.colAction')}</th>
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
                      {!u.enabled
                        ? t('admin.users.statusDisabled')
                        : u.locked
                          ? t('admin.users.statusLocked')
                          : t('admin.users.statusActive')}
                    </td>
                    <td className="user-actions">
                      {u.username !== user?.username && (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u)}
                          disabled={statusPendingId === u.id}
                        >
                          {u.enabled ? t('admin.users.deactivate') : t('admin.users.activate')}
                        </button>
                      )}
                      {u.locked && u.enabled && (
                        <button
                          type="button"
                          onClick={() => handleUnlock(u)}
                          disabled={statusPendingId === u.id}
                        >
                          {t('admin.users.unlock')}
                        </button>
                      )}
                      {u.username !== user?.username && (
                        <button type="button" onClick={() => startResetPassword(u.id)}>
                          {t('admin.users.changePassword')}
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
                              ? t('admin.users.deleteWarningStudent')
                              : t('admin.users.deleteWarningOther')}
                          </p>
                        )}
                        {resetPasswordForId === u.id && (
                          <form className="inline-form" onSubmit={(e) => handleResetPassword(e, u)}>
                            <label>
                              {t('admin.users.newPassword')}
                              <input
                                type="password"
                                value={resetPasswordValue}
                                onChange={(e) => setResetPasswordValue(e.target.value)}
                                required
                              />
                            </label>
                            <button type="submit" disabled={resetPasswordSubmitting}>
                              {resetPasswordSubmitting ? t('common.saving') : t('admin.users.change')}
                            </button>
                            <button type="button" onClick={cancelResetPassword}>
                              {t('common.cancel')}
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
        {!usersLoading && !usersError && (
          <div className="user-actions">
            <button type="button" disabled={usersPage === 0} onClick={() => setUsersPage((p) => p - 1)}>
              {t('common.previous')}
            </button>
            <span>{t('common.page', { page: usersResult.page + 1, total: Math.max(usersResult.totalPages, 1) })}</span>
            <button
              type="button"
              disabled={usersPage + 1 >= usersResult.totalPages}
              onClick={() => setUsersPage((p) => p + 1)}
            >
              {t('common.next')}
            </button>
          </div>
        )}
        {deleteError && <p className="error">{deleteError}</p>}
        {resetPasswordSuccess && <p className="success">{resetPasswordSuccess}</p>}
      </section>

      <section className="card">
        <h2>{t('admin.audit.heading')}</h2>
        <form className="inline-form" onSubmit={(e) => e.preventDefault()}>
          <label>
            {t('admin.audit.eventType')}
            <input
              value={auditEventType}
              onChange={(e) => {
                setAuditEventType(e.target.value);
                setAuditPage(0);
              }}
              placeholder={t('admin.audit.eventTypePlaceholder')}
            />
          </label>
          <label>
            {t('admin.audit.involving')}
            <input
              value={auditInvolving}
              onChange={(e) => {
                setAuditInvolving(e.target.value);
                setAuditPage(0);
              }}
              placeholder={t('admin.audit.involvingPlaceholder')}
            />
          </label>
        </form>
        {auditLoading && <p>{t('common.loading')}</p>}
        {auditError && <p className="error">{auditError}</p>}
        {!auditLoading && !auditError && (
          <>
            {auditResult.content.length === 0 ? (
              <p>{t('admin.audit.noEvents')}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.audit.colDate')}</th>
                    <th>{t('admin.audit.colType')}</th>
                    <th>{t('admin.audit.colActor')}</th>
                    <th>{t('admin.audit.colTarget')}</th>
                    <th>{t('admin.audit.colIp')}</th>
                    <th>{t('admin.audit.colDetail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditResult.content.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(new Date(entry.createdAt), language)}</td>
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
                {t('common.previous')}
              </button>
              <span>
                {t('common.page', { page: auditResult.page + 1, total: Math.max(auditResult.totalPages, 1) })}
              </span>
              <button
                type="button"
                disabled={auditPage + 1 >= auditResult.totalPages}
                onClick={() => setAuditPage((p) => p + 1)}
              >
                {t('common.next')}
              </button>
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}
