import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../AppIcon';
import Button from '../ui/Button';
import SecureSessionIndicator from './SecureSessionIndicator';
import LanguageSwitcher from '../LanguageSwitcher';
import { usePermissions } from '../../hooks/usePermissions';

const HandlerNavigation = ({ onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth0();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  const {
    canViewTickets,
    canManageUsers,
    isAdmin: checkIsAdmin,
  } = usePermissions();
  const isAdminUser = checkIsAdmin();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const navigationItems = [
    {
      path: '/anonymous-report-form',
      label: 'Exit',
      icon: 'ArrowLeft',
      show: true,
    },
    {
      path: '/handler-dashboard',
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      show: canViewTickets,
    },
    // {
    //   path: '/admin-dashboard',
    //   label: 'Admin',
    //   icon: 'ShieldCheck',
    //   show: canManageUsers,
    // },
    {
      path: '/settings',
      label: 'System',
      icon: 'Settings',
      show: canManageUsers,
    },
    {
      path: '/analytics-dashboard',
      label: 'Analytics',
      icon: 'BarChart3',
      show: canManageUsers,
    },
  ];

  const filteredNavItems = navigationItems.filter((item) => item.show);

  const isActivePath = (path) => location?.pathname === path;

  const handleNavigation = (path) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const toggleUserMenu = () => {
    setShowUserMenu(!showUserMenu);
  };

  const handleProfileClick = () => {
    navigate('/handler-profile-management');
    setShowUserMenu(false);
  };

  const handleLogoutClick = () => {
    if (window.confirm(t('common.confirm') + '?')) {
      onLogout();
    }
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    const name = user?.name || user?.email || 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Get role display name
  const getRoleDisplay = () => {
    if (isAdminUser) return 'Administrator';
    if (canManageUsers && !canViewTickets) return 'Portaalbeheerder';
    if (canManageUsers) return 'Manager';
    return 'Handler';
  };

  // Get role badge color
  const getRoleBadgeColor = () => {
    if (isAdminUser) return 'bg-sky-100 text-sky-700 dark:bg-sky-50/30 dark:text-purple-300';
    if (canManageUsers && !canViewTickets) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    if (canManageUsers) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
  };

  return (
    <>
      <header className="handler-navigation">
        <div className="handler-nav-container">
          <div className="handler-nav-logo">
            <img 
              src="https://www.nedzink.com/wp-content/uploads/2019/03/logo_header_goed-1.svg" 
              alt="Misstanden Portal" 
              className="h-12 w-auto"
            />
          </div>

          <nav className="hidden lg:flex items-center gap-1">
            {filteredNavItems?.map((item) => (
              <button
                key={item?.path}
                onClick={() => handleNavigation(item?.path)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-smooth ${
                  isActivePath(item?.path)
                    ? 'bg-accent text-white'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <Icon name={item?.icon} size={16} />
                {item?.label}
              </button>
            ))}
          </nav>

          <div className="handler-nav-actions">
            <LanguageSwitcher className="hidden md:flex" />

            <div className="relative" ref={userMenuRef}>
              <button
                onClick={toggleUserMenu}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-smooth focus-ring ${
                  showUserMenu ? 'bg-muted' : 'hover:bg-muted'
                }`}
                aria-label="User menu"
                aria-expanded={showUserMenu}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                  {getUserInitials()}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-foreground leading-tight">
                    {user?.name || user?.email || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground leading-tight">
                    {getRoleDisplay()}
                  </p>
                </div>
                <Icon 
                  name="ChevronDown" 
                  size={16} 
                  className={`hidden sm:inline transition-transform duration-200 ${
                    showUserMenu ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-popover rounded-xl shadow-xl border border-border z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* User Info Header */}
                  <div className="p-4 bg-gradient-to-br from-primary/5 to-accent/5 border-b border-border">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold shadow-sm">
                        {getUserInitials()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {user?.name || 'User'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {user?.email}
                        </p>
                        <div className="mt-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getRoleBadgeColor()}`}>
                            <Icon name="Shield" size={12} className="mr-1" />
                            {getRoleDisplay()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="p-2">
                    <button
                      onClick={handleProfileClick}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-smooth text-left group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Icon name="User" size={16} className="text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{t('navigation.profile')}</p>
                        <p className="text-xs text-muted-foreground">Manage your account</p>
                      </div>
                      <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
                    </button>

                    {canManageUsers && (
                      <button
                        onClick={() => {
                          navigate('/settings?mode=admin');
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-smooth text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                          <Icon name="Settings" size={16} className="text-accent" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">Admin Center</p>
                          <p className="text-xs text-muted-foreground">Users, workflows & settings</p>
                        </div>
                        <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-border my-1"></div>

                  {/* Logout */}
                  <div className="p-2">
                    <button
                      onClick={handleLogoutClick}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-smooth text-left group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/20 flex items-center justify-center group-hover:bg-red-100 dark:group-hover:bg-red-950/30 transition-colors">
                        <Icon name="LogOut" size={16} className="text-red-600 dark:text-red-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-600 dark:text-red-400">{t('navigation.logout')}</p>
                        <p className="text-xs text-red-500/70 dark:text-red-400/70">End your session</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={toggleMobileMenu}
              className="md:hidden p-2 rounded-lg hover:bg-muted transition-smooth focus-ring"
              aria-label="Menu"
            >
              <Icon name={isMobileMenuOpen ? 'X' : 'Menu'} size={24} />
            </button>
          </div>
        </div>
      </header>

      {isMobileMenuOpen && (
        <>
          <div 
            className="mobile-menu-overlay md:hidden"
            onClick={toggleMobileMenu}
            style={{ opacity: isMobileMenuOpen ? 1 : 0 }}
          />
          <div 
            className="mobile-menu-container md:hidden"
            style={{ transform: isMobileMenuOpen ? 'translateX(0)' : 'translateX(100%)' }}
          >
            <div className="mobile-menu-header">
              <div className="flex items-center gap-3">
                <div className="handler-nav-logo-icon">
                  <Icon name="Shield" size={20} color="#FFFFFF" />
                </div>
                <span className="text-lg font-semibold">Menu</span>
              </div>
              <button
                onClick={toggleMobileMenu}
                className="p-2 rounded-lg hover:bg-muted transition-smooth"
                aria-label="Sluit menu"
              >
                <Icon name="X" size={24} />
              </button>
            </div>

            <nav className="mobile-menu-nav">
              {filteredNavItems?.map((item) => (
                <button
                  key={item?.path}
                  onClick={() => handleNavigation(item?.path)}
                  className={`mobile-menu-item ${isActivePath(item?.path) ? 'active' : ''}`}
                >
                  <Icon name={item?.icon} size={20} className="inline mr-3" />
                  {item?.label}
                </button>
              ))}

              <div className="mt-6 p-4 rounded-lg bg-muted">
                <SecureSessionIndicator />
              </div>

              <div className="mt-4">
                <Button
                  variant="outline"
                  fullWidth
                  iconName="LogOut"
                  iconPosition="left"
                  onClick={handleLogoutClick}
                >
                  {t('navigation.logout')}
                </Button>
              </div>
            </nav>
          </div>
        </>
      )}
    </>
  );
};

export default HandlerNavigation;
