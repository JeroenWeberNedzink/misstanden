import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Button from '../../../components/ui/Button';


const OAuthLoginButton = () => {
  const { loginWithRedirect, isLoading } = useAuth0();

  const handleLogin = () => {
    loginWithRedirect({
      authorizationParams: {
        connection: 'windowsazure',
        prompt: 'login'
      }
    });
  };

  return (
    <div className="mt-6">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-card text-muted-foreground">Of</span>
        </div>
      </div>

      <div className="mt-6">
        <Button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 shadow-sm"
        >
          <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 0H0V10H10V0Z" fill="#F25022"/>
            <path d="M21 0H11V10H21V0Z" fill="#7FBA00"/>
            <path d="M10 11H0V21H10V11Z" fill="#00A4EF"/>
            <path d="M21 11H11V21H21V11Z" fill="#FFB900"/>
          </svg>
          <span className="font-medium">Inloggen met Microsoft</span>
        </Button>
        <p className="mt-3 text-xs text-center text-muted-foreground">
          Indien u de melding heeft ingediend en uw Nedzink contactgegevens heeft ingevuld, dan kunnen we u alleen toegang verlenen via deze inlogmethode.
        </p>
      </div>
    </div>
  );
};

export default OAuthLoginButton;