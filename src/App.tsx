import { useEffect, useState } from 'react';
import {
  Bell,
  FileAudio,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { CategoriesSeriesTab } from './components/CategoriesSeriesTab';
import { ContentManagerTab } from './components/ContentManagerTab';
import { MobileConnectionTab } from './components/MobileConnectionTab';
import { NotificationsTab } from './components/NotificationsTab';
import { OverviewTab, type AdminTabKey } from './components/OverviewTab';
import { QaModerationTab } from './components/QaModerationTab';
import { UsersRolesTab } from './components/UsersRolesTab';
import { apiFetch, setAuthToken } from './lib/api';
import type {
  AuditLogEntry,
  CategoryItem,
  OverviewStats,
  SeriesItem,
  UserProfile,
} from './types';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(true);
  const [requiresPasscode, setRequiresPasscode] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTabKey>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openCreateSignal, setOpenCreateSignal] = useState(0);

  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [series, setSeries] = useState<SeriesItem[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    const checkBootstrap = async () => {
      try {
        const res = await apiFetch<{ hasAdmin: boolean; requiresPasscode: boolean }>(
          '/api/auth/bootstrap-status'
        );
        setHasAdmin(res.hasAdmin);
        setRequiresPasscode(res.requiresPasscode);
      } catch {
        setHasAdmin(true);
      } finally {
        setBootLoading(false);
      }
    };
    checkBootstrap();
  }, []);

  const refreshStudioData = async () => {
    if (!currentUser) return;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const [overviewRes, catRes, serRes] = await Promise.all([
        apiFetch<{ stats: OverviewStats; auditLogs: AuditLogEntry[] }>('/api/admin/overview'),
        apiFetch<{ categories: CategoryItem[] }>('/api/categories'),
        apiFetch<{ series: SeriesItem[] }>('/api/series'),
      ]);
      setStats(overviewRes.stats);
      setAuditLogs(overviewRes.auditLogs);
      setCategories(catRes.categories);
      setSeries(serRes.series);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Failed to load studio overview');
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      refreshStudioData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleSignOut = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setStats(null);
    setAuditLogs([]);
    setActiveTab('overview');
  };

  if (bootLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0B1115]">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Initializing Minaratul Huda Admin Studio…
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthGate
        hasAdmin={hasAdmin}
        requiresPasscode={requiresPasscode}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        onAuthenticated={(user) => setCurrentUser(user)}
        onAdminClaimed={() => setHasAdmin(true)}
      />
    );
  }

  const canManageContent = ['content_editor', 'administrator', 'super_admin'].includes(currentUser.role);
  const canModerateQa = ['qa_moderator', 'administrator', 'super_admin'].includes(currentUser.role);
  const canViewUsers = ['administrator', 'super_admin'].includes(currentUser.role);

  const navItems: {
    id: AdminTabKey;
    label: string;
    icon: typeof LayoutDashboard;
    visible: boolean;
    badge?: number;
  }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, visible: true },
    { id: 'content', label: 'Content Manager', icon: FileAudio, visible: canManageContent },
    {
      id: 'qa',
      label: 'Q&A Moderation',
      icon: MessageSquare,
      visible: canModerateQa,
      badge: stats?.pendingQa && stats.pendingQa > 0 ? stats.pendingQa : undefined,
    },
    { id: 'taxonomy', label: 'Categories & Series', icon: FolderTree, visible: canManageContent },
    { id: 'notifications', label: 'Notifications', icon: Bell, visible: canManageContent },
    { id: 'users', label: 'Users & Roles', icon: Users, visible: canViewUsers },
    { id: 'connection', label: 'Mobile Connection', icon: Globe, visible: true },
  ];

  const visibleNav = navItems.filter((n) => n.visible);
  const currentTabTitle = visibleNav.find((n) => n.id === activeTab)?.label || 'Overview';

  const handleQuickCreate = () => {
    setActiveTab('content');
    setOpenCreateSignal((prev) => prev + 1);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0B1115] dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-150 dark:border-slate-800 dark:bg-[#11191E] lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Minaratul Huda
          </span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded p-1 text-slate-400 hover:text-slate-700 lg:hidden dark:hover:text-slate-200"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileNavOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#0F4C3A] text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span
                    className={`ml-2 font-mono text-xs tabular-nums ${
                      active ? 'text-emerald-100' : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {currentUser.name}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {currentUser.email}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-[#0F4C3A] dark:text-emerald-400">
              {currentUser.role}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {darkMode ? 'Light' : 'Dark'}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-[#11191E]">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-slate-500 sm:inline dark:text-slate-400">
                Admin &amp; Content Studio
              </span>
              <span className="hidden text-slate-400 sm:inline">/</span>
              <h1 className="truncate font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {currentTabTitle}
              </h1>
            </div>
          </div>

          {canManageContent && (
            <button
              type="button"
              onClick={handleQuickCreate}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-[#0F4C3A] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0B3A2C]"
            >
              <Plus className="h-3.5 w-3.5" />
              New Content
            </button>
          )}
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              stats={stats}
              auditLogs={auditLogs}
              loading={overviewLoading}
              error={overviewError}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenNewContent={handleQuickCreate}
            />
          )}

          {activeTab === 'content' && canManageContent && (
            <ContentManagerTab
              categories={categories}
              series={series}
              openCreateSignal={openCreateSignal}
              onChanged={refreshStudioData}
            />
          )}

          {activeTab === 'qa' && canModerateQa && (
            <QaModerationTab
              defaultSpeakerName={currentUser.name}
              onChanged={refreshStudioData}
            />
          )}

          {activeTab === 'taxonomy' && canManageContent && (
            <CategoriesSeriesTab
              categories={categories}
              series={series}
              onChanged={refreshStudioData}
            />
          )}

          {activeTab === 'notifications' && canManageContent && (
            <NotificationsTab onChanged={refreshStudioData} />
          )}

          {activeTab === 'users' && canViewUsers && (
            <UsersRolesTab currentUser={currentUser} onChanged={refreshStudioData} />
          )}

          {activeTab === 'connection' && (
            <MobileConnectionTab currentUser={currentUser} />
          )}
        </main>
      </div>
    </div>
  );
}
