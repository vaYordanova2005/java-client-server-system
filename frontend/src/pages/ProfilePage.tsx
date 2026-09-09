import { useState, type FormEvent } from 'react';
import { extractErrorMessage } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { Layout } from '../routes/Layout';
import { useLanguage } from '../i18n/useLanguage';
import { useStudentProfile } from '../hooks/useStudentProfile';
import type { StudentProfileSummary } from '../types';

const PROFILE_FIELDS: { key: keyof StudentProfileSummary; labelKey: string }[] = [
  { key: 'degreeLevel', labelKey: 'profileFields.degreeLevel' },
  { key: 'facultyNumber', labelKey: 'profileFields.facultyNumber' },
  { key: 'faculty', labelKey: 'profileFields.faculty' },
  { key: 'specialty', labelKey: 'profileFields.specialty' },
  { key: 'studyMode', labelKey: 'profileFields.studyMode' },
  { key: 'specialization', labelKey: 'profileFields.specialization' },
  { key: 'groupNumber', labelKey: 'profileFields.groupNumber' },
  { key: 'admissionType', labelKey: 'profileFields.admissionType' },
  { key: 'status', labelKey: 'profileFields.status' },
  { key: 'enrolledSemester', labelKey: 'profileFields.enrolledSemester' },
  { key: 'completedSemester', labelKey: 'profileFields.completedSemester' },
  { key: 'stream', labelKey: 'profileFields.stream' },
  { key: 'studentUsername', labelKey: 'profileFields.email' },
];

/**
 * A field the admin saved as an empty string is just as absent as a `null`
 * one — `?? '—'` only catches the latter and would leave a blank cell.
 */
function displayValue(value: string | number | null | undefined): string | number {
  return value === null || value === undefined || value === '' ? '—' : value;
}

export function ProfilePage() {
  const { user, changePassword } = useAuth();
  const { t } = useLanguage();
  const { profile, error, loading } = useStudentProfile(user?.role === 'STUDENT');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatedPassword, setRepeatedPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    // Checked here as well as on the server: the repeat field only exists to
    // catch a typo, so there is no reason to spend a request on it.
    if (newPassword !== repeatedPassword) {
      setPasswordError(t('profile.passwordMismatch'));
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setRepeatedPassword('');
      setPasswordSuccess(t('profile.passwordChanged'));
    } catch (err) {
      setPasswordError(extractErrorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Layout>
      {user?.role === 'STUDENT' && (
        <section className="card">
          <h2>{t('profile.studentInfoHeading')}</h2>
          {loading && <p>{t('common.loading')}</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && profile && (
            <div className="profile-info-grid">
              {PROFILE_FIELDS.map(({ key, labelKey }) => (
                <div className="profile-info-row" key={key}>
                  <span className="profile-info-label">{t(labelKey)}</span>
                  <span className="profile-info-value">{displayValue(profile[key])}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {user?.role !== 'STUDENT' && (
        <section className="card">
          <p>{user?.username}</p>
        </section>
      )}

      <section className="card">
        <h2>{t('profile.changePasswordHeading')}</h2>
        <form className="password-form" onSubmit={handleChangePassword}>
          <label>
            {t('profile.currentPassword')}
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            {t('profile.newPassword')}
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            {t('profile.repeatPassword')}
            <input
              type="password"
              value={repeatedPassword}
              onChange={(e) => setRepeatedPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <p className="password-hint">{t('profile.passwordHint')}</p>
          {passwordError && <p className="error">{passwordError}</p>}
          {passwordSuccess && <p className="success">{passwordSuccess}</p>}
          <button type="submit" disabled={savingPassword}>
            {savingPassword ? t('profile.changing') : t('profile.changeButton')}
          </button>
        </form>
      </section>
    </Layout>
  );
}
