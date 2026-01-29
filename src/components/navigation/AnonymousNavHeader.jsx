import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../AppIcon';
import LanguageSwitcher from '../LanguageSwitcher';
import Button from '../ui/Button';


const AnonymousNavHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { loginWithRedirect, logout, isAuthenticated, user } = useAuth0();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

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
    { path: '/anonymous-report-form', label: t('ticketAccess.reportIncident'), icon: 'FileText' },
    { path: '/ticket-access-portal', label: t('ticketAccess.title'), icon: 'Key' },
    // { path: '/whistleblower-legal-guidance-portal', label: t('navigation.legalGuidance'), icon: 'Scale' }
  ];

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

  // Get user initials for avatar
  const getUserInitials = () => {
    const name = user?.name || user?.email || 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleLogoutClick = () => {
    if (window.confirm(t('common.confirm') + '?')) {
      logout({ logoutParams: { returnTo: window.location.origin } });
    }
  };

  return (
    <>
      <header className="anonymous-nav-header">
        <div className="anonymous-nav-container">
          <div className="anonymous-nav-logo">
            <img 
              src="https://www.nedzink.com/wp-content/uploads/2019/03/logo_header_goed-1.svg" 
              alt="Misstanden Portal" 
              className="h-12 w-auto"
            />
            {/* <span className="anonymous-nav-logo-tex">
              Misstanden Portal
            </span> */}
          </div>

          <nav className="hidden lg:flex items-center gap-1">
            {navigationItems?.map((item) => (
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

          <div className="anonymous-nav-actions">
            <div className="px-3 py-2 rounded-lg bg-muted/50 border border-border">
              <LanguageSwitcher />
            </div>

            {isAuthenticated ? (
              <div className="hidden lg:block relative" ref={userMenuRef}>
                <button
                  onClick={toggleUserMenu}
                  className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-smooth focus-ring ${
                    showUserMenu ? 'bg-muted' : 'hover:bg-muted'
                  }`}
                  aria-label="User menu"
                  aria-expanded={showUserMenu}
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                    {getUserInitials()}
                  </div>
                  <Icon
                    name="ChevronDown"
                    size={16}
                    className={`transition-transform duration-200 ${
                      showUserMenu ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-popover rounded-xl shadow-xl border border-border z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* User Info Header */}
                    <div className="p-4 bg-gradient-to-br from-primary/5 to-accent/5 border-b border-border">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                          {getUserInitials()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {user?.name || 'User'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {user?.email}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="p-2">
                      <button
                        onClick={() => {
                          navigate('/handler-dashboard');
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-smooth text-left group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <Icon name="LayoutDashboard" size={16} className="text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">Dashboard</p>
                          <p className="text-xs text-muted-foreground">View your tickets</p>
                        </div>
                        <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
                      </button>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-border my-1"></div>

                    {/* Logout */}
                    <div className="p-2">
                      <button
                        onClick={() => {
                          handleLogoutClick();
                          setShowUserMenu(false);
                        }}
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
            ) : (
              <Button
                onClick={() => loginWithRedirect()}
                iconName="LogIn"
                className="hidden lg:flex"
                size="sm"
              >
                Login
              </Button>
            )}

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
              {navigationItems?.map((item) => (
                <button
                  key={item?.path}
                  onClick={() => handleNavigation(item?.path)}
                  className={`mobile-menu-item ${isActivePath(item?.path) ? 'active' : ''}`}
                >
                  <Icon name={item?.icon} size={20} className="inline mr-3" />
                  {item?.label}
                </button>
              ))}

              <div className="mt-6 px-4 space-y-3">
                {isAuthenticated ? (
                  <>
                    <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-muted">
                      <Icon name="UserCheck" size={18} color="var(--color-accent)" />
                      <span className="text-sm font-medium text-foreground">
                        {user?.name || user?.email}
                      </span>
                    </div>
                    <Button
                      onClick={() => {
                        navigate('/handler-dashboard');
                        setIsMobileMenuOpen(false);
                      }}
                      fullWidth
                    >
                      Dashboard
                    </Button>
                    <Button
                      onClick={() => {
                        handleLogoutClick();
                        setIsMobileMenuOpen(false);
                      }}
                      variant="outline"
                      iconName="LogOut"
                      iconPosition="left"
                      fullWidth
                      className="border-red-200 text-red-600 hover:bg-red-50"
                    >
                      {t('navigation.logout')}
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      loginWithRedirect();
                      setIsMobileMenuOpen(false);
                    }}
                    iconName="LogIn"
                    fullWidth
                  >
                    Login
                  </Button>
                )}
              </div>
            </nav>
          </div>
        </>
      )}
    </>
  );
};

export default AnonymousNavHeader;