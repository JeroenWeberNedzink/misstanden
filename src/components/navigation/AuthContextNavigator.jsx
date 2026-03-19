import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { supabase } from '../../lib/supabase';
import { getOptionalApiAccessToken } from '../../lib/auth0ApiToken';
import AnonymousNavHeader from './AnonymousNavHeader';
import HandlerNavigation from './HandlerNavigation';
import NoAccessPage from '../auth/NoAccessPage';
import { isAdmin } from '../../utils/permissions';

const readCachedHandlerProfile = () => {
  try {
    const cached = sessionStorage.getItem('handler_profile');
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

const AuthContextNavigator = ({ children }) => {
  const {
    isAuthenticated: auth0Authenticated,
    isLoading: auth0Loading,
    user,
    getAccessTokenSilently,
  } = useAuth0();

  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    Boolean(sessionStorage.getItem('auth_token') && readCachedHandlerProfile())
  );
  const [userRole, setUserRole] = useState(() => sessionStorage.getItem('user_role'));
  const [handlerProfile, setHandlerProfile] = useState(() => readCachedHandlerProfile());
  const [isLoading, setIsLoading] = useState(() => !Boolean(readCachedHandlerProfile()));

  useEffect(() => {
    checkAuthenticationStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth0Authenticated, auth0Loading, user]);

  const loadHandlerProfile = async (email, sub) => {
    try {
      const normalizedEmail = String(email || '').toLowerCase().trim();
      const normalizedSub = String(sub || '').trim();

      if (!normalizedEmail && !normalizedSub) {
        console.warn('No email/sub provided to loadHandlerProfile');
        return null;
      }

      const token = await getOptionalApiAccessToken(getAccessTokenSilently);
      if (token) {
        try {
          const response = await fetch('/api/me.api.php', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const payload = await response.json().catch(() => null);
          if (response.ok && payload?.success && payload?.data?.handler) {
            return payload.data.handler;
          }
        } catch (apiError) {
          // Fallback to direct lookup to keep local/dev workflows working.
          console.warn('Handler API context lookup failed, trying direct profile lookup:', apiError);
        }
      }

      let data = null;
      let error = null;

      if (normalizedSub) {
        const resultBySub = await supabase
          .from('handlers')
          .select('*')
          .eq('user_id', normalizedSub)
          .eq('active', true)
          .maybeSingle();
        data = resultBySub.data;
        error = resultBySub.error;
      }

      if (!data && normalizedEmail) {
        const resultByEmail = await supabase
          .from('handlers')
          .select('*')
          .ilike('email', normalizedEmail)
          .eq('active', true)
          .maybeSingle();
        data = resultByEmail.data;
        error = resultByEmail.error;

        if (data && normalizedSub && !data.user_id) {
          await supabase
            .from('handlers')
            .update({ user_id: normalizedSub })
            .eq('id', data.id);
        }
      }

      if (error) {
        console.error('Failed to load handler profile:', error);
        return null;
      }

      // If no handler found, return null
      if (!data) {
        console.warn(`No active handler found for user (sub=${normalizedSub || 'n/a'}, email=${normalizedEmail || 'n/a'})`);
        return null;
      }

      // Update last_login timestamp (ignore errors)
      try {
        await supabase
          .from('handlers')
          .update({ last_login: new Date().toISOString() })
          .eq('id', data.id);
      } catch (updateError) {
        console.warn('Could not update last_login:', updateError);
      }

      return data;
    } catch (error) {
      console.error('Error loading handler profile:', error);
      return null;
    }
  };

  const deriveRoleFromHandler = (handler) => {
    if (!handler) return 'handler';

    // Check if user is admin based on roles
    if (isAdmin(handler.roles)) {
      return 'admin';
    }

    // Fallback to handler role
    return 'handler';
  };

  const checkAuthenticationStatus = async () => {
    try {
      // Prefer your existing session-based auth if present
      const authToken = sessionStorage.getItem('auth_token');
      const userRoleData = sessionStorage.getItem('user_role');
      const cachedProfile = sessionStorage.getItem('handler_profile');

      // 1) If session says authenticated, trust it (but verify on Auth0 change)
      if (authToken && userRoleData && cachedProfile && !user) {
        setIsAuthenticated(true);
        setUserRole(userRoleData);
        setHandlerProfile(JSON.parse(cachedProfile));
        setIsLoading(false);
        return;
      }

      // 2) Load from Auth0 and database
      if (!auth0Loading && auth0Authenticated && (user?.email || user?.sub)) {
        // Load handler profile from database
        const profile = await loadHandlerProfile(user?.email, user?.sub);

        if (!profile) {
          // User authenticated in Auth0 but not in handlers table
          console.warn('User authenticated but not found in handlers table');
          setIsAuthenticated(false);
          setUserRole(null);
          setHandlerProfile(null);
          setIsLoading(false);
          return;
        }

        const derivedRole = deriveRoleFromHandler(profile);

        setIsAuthenticated(true);
        setUserRole(derivedRole);
        setHandlerProfile(profile);

        // Persist to session
        sessionStorage.setItem('auth_token', 'auth0');
        sessionStorage.setItem('user_role', derivedRole);
        sessionStorage.setItem('handler_profile', JSON.stringify(profile));
        setIsLoading(false);
        return;
      }

      // 3) Not authenticated
      setIsAuthenticated(false);
      setUserRole(null);
      setHandlerProfile(null);
      setIsLoading(false);
    } catch (error) {
      console.error('Authentication check failed:', error);
      setIsAuthenticated(false);
      setUserRole(null);
      setHandlerProfile(null);
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('user_role');
    sessionStorage.removeItem('handler_profile');
    setIsAuthenticated(false);
    setUserRole(null);
    setHandlerProfile(null);
    window.location.href = '/anonymous-report-form';
  };

  if (isLoading || auth0Loading) {
    return (
      <>
        {isAuthenticated ? (
          <HandlerNavigation userRole={userRole ?? 'handler'} onLogout={handleLogout} />
        ) : (
          <AnonymousNavHeader />
        )}
        <div className="pt-20">{children}</div>
      </>
    );
  }

  // If user is authenticated via Auth0 but no handler profile exists, show no access page
  if (auth0Authenticated && !handlerProfile && !isLoading) {
    return <NoAccessPage />;
  }

  return (
    <>
      {isAuthenticated ? (
        <HandlerNavigation userRole={userRole ?? 'handler'} onLogout={handleLogout} />
      ) : (
        <AnonymousNavHeader />
      )}
      <div className="pt-20">{children}</div>
    </>
  );
};

export default AuthContextNavigator;
