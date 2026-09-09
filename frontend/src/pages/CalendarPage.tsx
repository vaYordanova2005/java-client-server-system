import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Layout } from '../routes/Layout';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { resources } from '../i18n/translations';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import apiClient, { extractErrorMessage } from '../api/client';
import { ConfirmDeleteButton } from '../components/ConfirmDeleteButton';
import type { CalendarEventType } from '../types';
import { buildMonthGrid, eventsOnDate, eventTypeLabel, formatDate, formatDateShort, toDateKey } from '../utils/calendar';

export function CalendarPage() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const monthNames = resources[language].calendar.months;
  const weekdayLabels = resources[language].calendar.weekdays;
  const canManage = user?.role === 'ADMIN' || user?.role === 'TEACHER';
  const { events, error, loading, refresh } = useCalendarEvents();

  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const [monthCursor, setMonthCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const weeks = useMemo(
    () => buildMonthGrid(monthCursor.getFullYear(), monthCursor.getMonth()),
    [monthCursor]
  );

  const [picker, setPicker] = useState<'month' | 'year' | null>(null);
  const [pickerYear, setPickerYear] = useState(monthCursor.getFullYear());
  const [yearRangeStart, setYearRangeStart] = useState(monthCursor.getFullYear() - 5);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picker) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPicker(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [picker]);

  const openPicker = (mode: 'month' | 'year') => {
    if (picker === mode) {
      setPicker(null);
      return;
    }
    setPickerYear(monthCursor.getFullYear());
    setYearRangeStart(monthCursor.getFullYear() - 5);
    setPicker(mode);
  };

  const [type, setType] = useState<CalendarEventType>('TEST');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const goToMonth = (delta: number) => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);
    try {
      await apiClient.post('/calendar/events', {
        type,
        title,
        description: description || null,
        subject: type === 'TEST' ? subject : null,
        startDate,
        endDate: endDate || null,
      });
      setFormSuccess(t('calendar.eventAdded'));
      setTitle('');
      setSubject('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      refresh();
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Two-step inline confirm instead of window.confirm — the app's own UI
  // for a destructive action, same pattern as grade deletion elsewhere.
  const requestDelete = (id: number) => {
    setFormError(null);
    setConfirmingDeleteId(id);
  };

  const cancelDelete = () => setConfirmingDeleteId(null);

  const confirmDelete = async (id: number) => {
    setConfirmingDeleteId(null);
    setDeletingId(id);
    try {
      await apiClient.delete(`/calendar/events/${id}`);
      refresh();
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const selectedEvents = selectedDateKey ? eventsOnDate(events, selectedDateKey) : [];
  const upcoming = [...events]
    .filter((e) => (e.endDate ?? e.startDate) >= todayKey)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <Layout>
      <section className="card">
        <div className="calendar-header">
          <button type="button" onClick={() => goToMonth(-1)} aria-label={t('calendar.prevMonth')}>
            &larr;
          </button>
          <div className="calendar-month-year" ref={pickerRef}>
            <button type="button" className="calendar-my-label" onClick={() => openPicker('month')}>
              {monthNames[monthCursor.getMonth()]}
            </button>
            <button type="button" className="calendar-my-label" onClick={() => openPicker('year')}>
              {monthCursor.getFullYear()}
            </button>

            {picker === 'month' && (
              <div className="calendar-picker">
                <div className="calendar-picker-nav">
                  <button type="button" onClick={() => setPickerYear((y) => y - 1)} aria-label={t('calendar.prevYear')}>
                    &larr;
                  </button>
                  <span>{pickerYear}</span>
                  <button type="button" onClick={() => setPickerYear((y) => y + 1)} aria-label={t('calendar.nextYear')}>
                    &rarr;
                  </button>
                </div>
                <div className="calendar-picker-grid">
                  {monthNames.map((name, idx) => (
                    <button
                      type="button"
                      key={name}
                      className={
                        'calendar-picker-cell' +
                        (idx === monthCursor.getMonth() && pickerYear === monthCursor.getFullYear()
                          ? ' calendar-picker-cell-active'
                          : '')
                      }
                      onClick={() => {
                        setMonthCursor(new Date(pickerYear, idx, 1));
                        setPicker(null);
                      }}
                    >
                      {name.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {picker === 'year' && (
              <div className="calendar-picker">
                <div className="calendar-picker-nav">
                  <button type="button" onClick={() => setYearRangeStart((s) => s - 12)} aria-label={t('calendar.prevYears')}>
                    &larr;
                  </button>
                  <span>
                    {yearRangeStart} – {yearRangeStart + 11}
                  </span>
                  <button type="button" onClick={() => setYearRangeStart((s) => s + 12)} aria-label={t('calendar.nextYears')}>
                    &rarr;
                  </button>
                </div>
                <div className="calendar-picker-grid">
                  {Array.from({ length: 12 }, (_, i) => yearRangeStart + i).map((y) => (
                    <button
                      type="button"
                      key={y}
                      className={
                        'calendar-picker-cell' + (y === monthCursor.getFullYear() ? ' calendar-picker-cell-active' : '')
                      }
                      onClick={() => {
                        setMonthCursor(new Date(y, monthCursor.getMonth(), 1));
                        setPicker(null);
                      }}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button type="button" onClick={() => goToMonth(1)} aria-label={t('calendar.nextMonth')}>
            &rarr;
          </button>
          <button
            type="button"
            className="calendar-today-btn"
            onClick={() => setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            {t('calendar.today')}
          </button>
        </div>

        {loading && <p>{t('common.loading')}</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && (
          <>
            <div className="calendar-grid calendar-weekdays">
              {weekdayLabels.map((d) => (
                <div key={d} className="calendar-weekday">
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div className="calendar-grid" key={wi}>
                {week.map((date) => {
                  const dateKey = toDateKey(date);
                  const dayEvents = eventsOnDate(events, dateKey);
                  const inMonth = date.getMonth() === monthCursor.getMonth();
                  return (
                    <button
                      type="button"
                      key={dateKey}
                      className={
                        'calendar-day' +
                        (inMonth ? '' : ' calendar-day-outside') +
                        (dateKey === todayKey ? ' calendar-day-today' : '') +
                        (dateKey === selectedDateKey ? ' calendar-day-selected' : '')
                      }
                      onClick={() => setSelectedDateKey(dateKey === selectedDateKey ? null : dateKey)}
                    >
                      <span className="calendar-day-number">{date.getDate()}</span>
                      <span className="calendar-day-pills">
                        {dayEvents.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className={`calendar-pill calendar-pill-${e.type.toLowerCase()}`}
                            title={e.title}
                          />
                        ))}
                        {dayEvents.length > 3 && <span className="calendar-pill-more">+{dayEvents.length - 3}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </section>

      {selectedDateKey && (
        <section className="card">
          <h2>{formatDate(selectedDateKey, language)}</h2>
          {selectedEvents.length === 0 ? (
            <p>{t('calendar.noEntriesForDay')}</p>
          ) : (
            <ul className="calendar-event-list">
              {selectedEvents.map((e) => (
                <li key={e.id} className="calendar-event-item">
                  <span className={`calendar-pill calendar-pill-${e.type.toLowerCase()}`} />
                  <div>
                    <strong>{e.title}</strong>{' '}
                    <span className="calendar-event-type">
                      ({eventTypeLabel(e.type, t)}
                      {e.subject ? ` · ${e.subject}` : ''})
                    </span>
                    {e.description && <p className="calendar-event-desc">{e.description}</p>}
                    <p className="calendar-event-author">{t('calendar.addedBy', { name: e.createdByUsername })}</p>
                  </div>
                  {canManage && (
                    <ConfirmDeleteButton
                      id={e.id}
                      confirmingDeleteId={confirmingDeleteId}
                      deletingId={deletingId}
                      onRequestDelete={requestDelete}
                      onCancelDelete={cancelDelete}
                      onConfirmDelete={confirmDelete}
                      className="calendar-delete-btn"
                      confirmWrapperClassName="calendar-delete-confirm"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canManage && (
        <section className="card">
          <h2>{t('calendar.addHeading')}</h2>
          <form onSubmit={handleSubmit} className="inline-form">
            <label>
              {t('calendar.type')}
              <select value={type} onChange={(e) => setType(e.target.value as CalendarEventType)}>
                <option value="TEST">{t('calendarType.TEST')}</option>
                <option value="HOLIDAY">{t('calendarType.HOLIDAY')}</option>
                <option value="EVENT">{t('calendarType.EVENT')}</option>
              </select>
            </label>
            <label>
              {t('calendar.titleLabel')}
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            {type === 'TEST' && (
              <label>
                {t('calendar.subject')}
                <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </label>
            )}
            <label>
              {t('calendar.startDate')}
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </label>
            <label>
              {t('calendar.endDate')}
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
            <label>
              {t('calendar.description')}
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? t('calendar.adding') : t('calendar.add')}
            </button>
          </form>
          {formError && <p className="error">{formError}</p>}
          {formSuccess && <p className="success">{formSuccess}</p>}
        </section>
      )}

      <section className="card">
        <h2>{t('calendar.upcomingHeading')}</h2>
        {upcoming.length === 0 ? (
          <p>{t('calendar.upcomingEmpty')}</p>
        ) : (
          <ul className="calendar-event-list">
            {upcoming.map((e) => (
              <li key={e.id} className="calendar-event-item">
                <span className={`calendar-pill calendar-pill-${e.type.toLowerCase()}`} />
                <div>
                  <strong>{e.title}</strong>{' '}
                  <span className="calendar-event-type">
                    ({eventTypeLabel(e.type, t)}
                    {e.subject ? ` · ${e.subject}` : ''}) · {formatDateShort(e.startDate, language)}
                    {e.endDate && e.endDate !== e.startDate ? ` – ${formatDateShort(e.endDate, language)}` : ''}
                    {' · '}
                    {t('calendar.addedBy', { name: e.createdByUsername })}
                  </span>
                </div>
                {canManage && (
                  <ConfirmDeleteButton
                    id={e.id}
                    confirmingDeleteId={confirmingDeleteId}
                    deletingId={deletingId}
                    onRequestDelete={requestDelete}
                    onCancelDelete={cancelDelete}
                    onConfirmDelete={confirmDelete}
                    className="calendar-delete-btn"
                    confirmWrapperClassName="calendar-delete-confirm"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Layout>
  );
}
