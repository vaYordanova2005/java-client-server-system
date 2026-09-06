import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { HomeIcon, JournalIcon, ChartIcon, CalendarIcon, StudentsIcon } from '../components/icons';
import { NetworkField } from '../components/NetworkField';
import type { Role } from '../types';

// Дневник and Статистики render real data for STUDENT (own grades) and
// TEACHER (own-entered grades); ADMIN still gets "в процес на разработка" on
// those routes, so the nav doesn't offer them there.
const ROLES_WITH_JOURNAL_AND_STATISTICS: Role[] = ['STUDENT', 'TEACHER'];

export function Layout({ title, children }: { title?: string; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const homePath = user ? `/${user.role.toLowerCase()}` : '/';
  const showJournalAndStatistics = !!user && ROLES_WITH_JOURNAL_AND_STATISTICS.includes(user.role);
  const showStudents = user?.role === 'TEACHER';
  const navItems = [
    { to: homePath, label: 'Начало', icon: HomeIcon, end: true },
    ...(showJournalAndStatistics ? [{ to: '/journal', label: 'Дневник', icon: JournalIcon, end: false }] : []),
    ...(showStudents ? [{ to: '/students', label: 'Студенти', icon: StudentsIcon, end: false }] : []),
    ...(showJournalAndStatistics ? [{ to: '/statistics', label: 'Статистики', icon: ChartIcon, end: false }] : []),
    { to: '/calendar', label: 'Календар', icon: CalendarIcon, end: false },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="page">
      <NetworkField
        className="home-network-bg"
        intensity={1.9}
        minNodes={90}
        maxNodes={220}
        areaPerNode={3200}
        linkDist={85}
        maxPulses={40}
      />
      <header className="topbar">
        <Link to="/" className="brand">Markly</Link>
        <nav className="topnav">
          {navItems.map(({ to, label, icon: ItemIcon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <ItemIcon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-user">
          <Link to="/profile" className="topbar-username">
            {user?.username}
          </Link>
          <button onClick={handleLogout}>Изход</button>
        </div>
      </header>
      <main>
        {title && <h2 className="page-title">{title}</h2>}
        {children}
      </main>
    </div>
  );
}
