let sharedTokenProvider = null;

export const setSharedTokenProvider = (provider) => {
  sharedTokenProvider = typeof provider === 'function' ? provider : null;
};

export const getSharedTokenProvider = () => sharedTokenProvider;
