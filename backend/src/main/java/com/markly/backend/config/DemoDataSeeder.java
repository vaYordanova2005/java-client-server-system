package com.markly.backend.config;

import com.markly.backend.domain.CalendarEvent;
import com.markly.backend.domain.CalendarEventType;
import com.markly.backend.domain.Grade;
import com.markly.backend.domain.GradeType;
import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import com.markly.backend.repository.CalendarEventRepository;
import com.markly.backend.repository.GradeRepository;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.service.StudentProfileNormalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Random;

/**
 * Seeds 8 teachers, 8 subjects, 20 students, and a spread of grades so the
 * dashboards have real data to render. Disabled by default — opt in with
 * {@code SEED_DEMO_DATA=true}. Skips itself once the first demo teacher
 * already exists, so it only ever runs once per database. Usernames/passwords
 * are generated to satisfy {@link com.markly.backend.service.UserValidationService}
 * so demo accounts behave exactly like admin-created ones; see README for the
 * shared demo credentials.
 */
@Component
public class DemoDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    static final String DEMO_TEACHER_PASSWORD = "password12345";
    static final String DEMO_STUDENT_PASSWORD = "password12345";

    private static final int TEACHER_COUNT = 8;
    private static final int STUDENT_COUNT = 20;
    private static final long RANDOM_SEED = 42L;

    /** How many subjects a student is examined in per semester. */
    private static final int SUBJECTS_PER_SEMESTER = 4;
    /**
     * Shifts the window of subjects by this much every semester, so a subject
     * reappears in several semesters (the per-subject trend needs more than
     * one measurement) without every semester having the same subject list.
     */
    private static final int SUBJECT_WINDOW_STRIDE = 3;
    private static final int FAIL_GRADE = 2;
    /** A retake is scheduled even without a failing grade this often (percent). */
    private static final int EXTRA_RETAKE_PERCENT = 8;

    /** How many days before the session end a retake is recorded. */
    private static final int RETAKE_LEAD_DAYS = 5;
    /**
     * How many days before the session end the <em>last</em> regular-session
     * grade in a semester (k = SUBJECTS_PER_SEMESTER - 1) is recorded; earlier
     * ones (smaller k) get more days still. Derived from
     * {@link #RETAKE_LEAD_DAYS} and {@link #SUBJECTS_PER_SEMESTER} rather than
     * a second independent literal, so growing SUBJECTS_PER_SEMESTER can never
     * silently push a regular-session offset past RETAKE_LEAD_DAYS and make a
     * retake sort before the grade it's retaking — see {@code saveGrade}.
     */
    private static final int REGULAR_LEAD_DAYS_BASE = RETAKE_LEAD_DAYS + SUBJECTS_PER_SEMESTER;

    private static final List<String> SUBJECTS = List.of(
            "Математически анализ",
            "Линейна алгебра",
            "Програмиране",
            "Дискретни структури",
            "Обща физика",
            "Електротехника",
            "Бази от данни",
            "Компютърни мрежи"
    );

    // Teacher usernames must match ^[a-z]+[0-9]*@uni-sofia.bg$.
    private static final List<String> TEACHER_HANDLES = List.of(
            "teacher1", "teacher2", "teacher3", "teacher4",
            "teacher5", "teacher6", "teacher7", "teacher8"
    );

    private static final List<String> FACULTIES = List.of("Факултет компютърни системи и технологии");
    private static final List<String> SPECIALTIES = List.of("Компютърно и софтуерно инженерство");
    private static final List<String> ADMISSION_TYPES = List.of("Държавна поръчка", "Платено обучение");

    private final UserRepository userRepository;
    private final GradeRepository gradeRepository;
    private final CalendarEventRepository calendarEventRepository;
    private final StudentProfileRepository studentProfileRepository;
    private final PasswordEncoder passwordEncoder;
    private final boolean enabled;

    public DemoDataSeeder(
            UserRepository userRepository,
            GradeRepository gradeRepository,
            CalendarEventRepository calendarEventRepository,
            StudentProfileRepository studentProfileRepository,
            PasswordEncoder passwordEncoder,
            @Value("${app.seed-demo-data.enabled:false}") boolean enabled) {
        this.userRepository = userRepository;
        this.gradeRepository = gradeRepository;
        this.calendarEventRepository = calendarEventRepository;
        this.studentProfileRepository = studentProfileRepository;
        this.passwordEncoder = passwordEncoder;
        this.enabled = enabled;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (!enabled || userRepository.existsByUsernameIgnoreCase(TEACHER_HANDLES.get(0) + "@uni-sofia.bg")) {
            return;
        }

        List<User> teachers = TEACHER_HANDLES.stream()
                .map(handle -> userRepository.save(
                        new User(handle + "@uni-sofia.bg", passwordEncoder.encode(DEMO_TEACHER_PASSWORD), Role.TEACHER)))
                .toList();

        Random random = new Random(RANDOM_SEED);
        int gradeCount = 0;
        for (int i = 1; i <= STUDENT_COUNT; i++) {
            String username = "student" + i + "@uni-sofia.bg";
            User student = userRepository.save(
                    new User(username, passwordEncoder.encode(DEMO_STUDENT_PASSWORD), Role.STUDENT));
            int enrolledSemester = 1 + random.nextInt(8);
            studentProfileRepository.save(seedStudentProfile(student, i, enrolledSemester));

            // Every semester the student has reached gets grades, including the
            // one they are enrolled in right now: the journal, the semester
            // trend and the "(текущ)" marker all read straight off this data,
            // so a gap here shows up as an empty semester in the UI.
            for (int semester = 1; semester <= enrolledSemester; semester++) {
                for (int k = 0; k < SUBJECTS_PER_SEMESTER; k++) {
                    int subjectIndex = ((semester - 1) * SUBJECT_WINDOW_STRIDE + k) % SUBJECTS.size();
                    String subject = SUBJECTS.get(subjectIndex);
                    User teacher = teachers.get(subjectIndex % teachers.size());

                    int grade = weightedGrade(random);
                    saveGrade(student, teacher, subject, enrolledSemester, semester, grade,
                            REGULAR_LEAD_DAYS_BASE - k, GradeType.REGULAR);
                    gradeCount++;

                    // A failing grade is always retaken; a few passing ones are
                    // retaken too, so the "редовна срещу поправителна" split has
                    // something to compare.
                    if (grade == FAIL_GRADE || random.nextInt(100) < EXTRA_RETAKE_PERCENT) {
                        saveGrade(student, teacher, subject, enrolledSemester, semester,
                                retakeGrade(random), RETAKE_LEAD_DAYS, GradeType.RETAKE);
                        gradeCount++;
                    }
                }
            }
        }

        seedCalendarEvents(teachers.get(0));

        log.info("Seeded demo data: {} teachers ({}..{}@uni-sofia.bg), {} students (student1..{}@uni-sofia.bg), "
                        + "{} grades across {} subjects. Demo credentials are documented in README.",
                TEACHER_COUNT, TEACHER_HANDLES.get(0), TEACHER_HANDLES.get(TEACHER_HANDLES.size() - 1),
                STUDENT_COUNT, STUDENT_COUNT,
                gradeCount, SUBJECTS.size());
    }

    /**
     * {@code createdAt} is set explicitly instead of being left to
     * {@code @PrePersist}: the whole seed runs in one batch, so every grade
     * would otherwise carry the same instant and the frontend could not tell
     * a regular session from its retake — that classification is based purely
     * on which of the two was recorded first.
     *
     * @param daysBeforeSessionEnd how far before the semester's exam session
     *                             closes the grade was entered; a retake uses a
     *                             smaller value than the regular session so it
     *                             always sorts after it.
     */
    private void saveGrade(
            User student, User teacher, String subject,
            int enrolledSemester, int semester, int grade, int daysBeforeSessionEnd, GradeType gradeType) {
        Grade entity = new Grade(student, teacher, subject, semester, grade, gradeType);
        entity.setCreatedAt(sessionInstant(enrolledSemester, semester, daysBeforeSessionEnd));
        gradeRepository.save(entity);
    }

    /** Semesters are half a year apart; the current one ends today. */
    private Instant sessionInstant(int enrolledSemester, int semester, int daysBeforeSessionEnd) {
        return LocalDate.now()
                .minusMonths(6L * (enrolledSemester - semester))
                .minusDays(daysBeforeSessionEnd)
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant();
    }

    /**
     * A handful of upcoming tests (one per subject), plus a holiday and a
     * job-fair event, so the calendar isn't empty on a fresh demo database.
     * Attributed to the first demo teacher — which role actually "created"
     * seed data doesn't matter here.
     */
    private void seedCalendarEvents(User creator) {
        LocalDate today = LocalDate.now();
        for (int s = 0; s < SUBJECTS.size(); s++) {
            calendarEventRepository.save(new CalendarEvent(
                    CalendarEventType.TEST,
                    "Тест по " + SUBJECTS.get(s),
                    null,
                    SUBJECTS.get(s),
                    today.plusDays(7 + s * 3L),
                    null,
                    creator));
        }
        calendarEventRepository.save(new CalendarEvent(
                CalendarEventType.EVENT,
                "Кариерен ден — фирмени представяния",
                "Компании от бранша представят стажантски и junior позиции.",
                null,
                today.plusDays(14),
                null,
                creator));
        calendarEventRepository.save(new CalendarEvent(
                CalendarEventType.HOLIDAY,
                "Зимна ваканция",
                null,
                null,
                today.plusDays(30),
                today.plusDays(37),
                creator));
    }

    /**
     * Fictional registrar-style info (faculty number, group, semester
     * status, etc.) so the profile page isn't empty on a fresh demo
     * database. Values are generated, not copied from any real record.
     *
     * <p>{@code index} (1..{@link #STUDENT_COUNT}) makes the faculty number
     * unique and deterministic across the whole seed, which is what lets
     * {@code student_profiles.faculty_number}'s unique index (see V8) accept
     * it without collisions; run through {@link StudentProfileNormalizer}
     * anyway so this stays byte-for-byte what every other writer of the
     * column would produce, even though a digits-only value is already a
     * no-op under trim/uppercase.
     */
    private StudentProfile seedStudentProfile(User student, int index, int enrolledSemester) {
        StudentProfile profile = new StudentProfile(student);
        profile.setDegreeLevel("Бакалавър");
        profile.setFacultyNumber(StudentProfileNormalizer.normalizeFacultyNumber(String.format("12%04d", 1000 + index)));
        profile.setFaculty(FACULTIES.get(0));
        profile.setSpecialty(SPECIALTIES.get(0));
        profile.setStudyMode("редовно");
        profile.setGroupNumber(String.valueOf(40 + (index % 6)));
        profile.setAdmissionType(ADMISSION_TYPES.get(index % ADMISSION_TYPES.size()));
        profile.setStatus("Записан");
        profile.setEnrolledSemester(enrolledSemester);
        profile.setCompletedSemester(Math.max(0, enrolledSemester - 1));
        profile.setStream(String.valueOf(1 + (index % 12)));
        return profile;
    }

    private int weightedGrade(Random random) {
        int roll = random.nextInt(100);
        if (roll < 5) return 2;
        if (roll < 20) return 3;
        if (roll < 45) return 4;
        if (roll < 75) return 5;
        return 6;
    }

    /**
     * A retake usually recovers to a pass, but {@code 3 + random.nextInt(4)}
     * (range 3..6) never can — the demo data had no student failing the same
     * exam twice. This keeps the bias toward passing but leaves the door open.
     */
    private int retakeGrade(Random random) {
        int roll = random.nextInt(100);
        if (roll < 10) return FAIL_GRADE;
        if (roll < 35) return 3;
        if (roll < 70) return 4;
        return 5 + random.nextInt(2);
    }
}
