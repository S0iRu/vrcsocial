// Utility file for VRChat API configuration
// Note: Currently we are initializing API instances directly in route handlers
// to avoid import/export quirks with the 'vrchat' package version.

import * as vrchat from 'vrchat';

/*
export const getVRChatConfig = (username?: string, password?: string) => {
    const Configuration = (vrchat as any).Configuration || (vrchat as any).default?.Configuration;
    
    if (!Configuration) return {};

    return new Configuration({
        username,
        password,
        baseOptions: {
            headers: {
                'User-Agent': 'VRC Social/1.0.0'
            }
        }
    });
};
*/
