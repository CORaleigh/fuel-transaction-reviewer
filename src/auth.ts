// auth.ts
import OAuthInfo from "@arcgis/core/identity/OAuthInfo.js";
import IdentityManager from "@arcgis/core/identity/IdentityManager.js";
import Portal from "@arcgis/core/portal/Portal.js";

const info = new OAuthInfo({
    appId: "L58wCfrXDerNdEWj",
    portalUrl: "https://ral.maps.arcgis.com",
    popup: false, // redirect instead of popup
});

IdentityManager.registerOAuthInfos([info]);

export const signIn = async () => {
    await IdentityManager.getCredential(`${info.portalUrl}/sharing`);
};

export const signOut = () => {
    IdentityManager.destroyCredentials();
    window.location.reload();
};

export const getUser = async () => {
    try {
        await IdentityManager.checkSignInStatus(
            `${info.portalUrl}/sharing`
        );
        const portal = new Portal({ url: info.portalUrl });
        await portal.load();
        return portal.user;
    } catch {
        return null;
    }
};