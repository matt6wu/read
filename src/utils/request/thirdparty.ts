import toast from "react-hot-toast";
import {
  ConfigService,
  SyncUtil,
  ThirdpartyRequest,
  TokenService,
} from "../../assets/lib/kookit-extra-browser.min";
import i18n from "../../i18n";
import { handleExitApp } from "./common";
let thirdpartyRequest: ThirdpartyRequest | undefined;
export const getThirdpartyRequest = async () => {
  if (thirdpartyRequest) {
    return thirdpartyRequest;
  }
  thirdpartyRequest = new ThirdpartyRequest(TokenService, ConfigService);
  return thirdpartyRequest;
};
export const resetThirdpartyRequest = () => {
  thirdpartyRequest = undefined;
};
export const onSyncCallback = async (service: string, authCode: string) => {
  toast.loading(i18n.t("Adding"), { id: "adding-sync-id" });
  
  if (!service || !authCode) {
    toast.error(i18n.t("Invalid service or authorization code"), { id: "adding-sync-id" });
    return;
  }

  let thirdpartyRequest = await getThirdpartyRequest();

  try {
    let syncUtil = new SyncUtil(service, {}, thirdpartyRequest);
    let refreshToken = await syncUtil.authToken(authCode);
    
    if (!refreshToken || typeof refreshToken !== 'string') {
      console.error(`Authorization failed for ${service}: Invalid refresh token received:`, refreshToken);
      toast.error(i18n.t("Authorization failed") + `: Invalid token received`, { id: "adding-sync-id" });
      return;
    }
    
    // FOR PCLOUD, THE REFRESH TOKEN IS THE ACCESS TOKEN, ACCESS TOKEN NEVER EXPIRES
    let res = await encryptToken(service, {
      refresh_token: refreshToken,
      auth_date: new Date().getTime(),
      service: service,
      version: 1,
    });
    
    if (res.code === 200) {
      ConfigService.setListConfig(service, "dataSourceList");
      toast.success(i18n.t("Binding successful"), { id: "adding-sync-id" });
    } else {
      console.error(`Token encryption failed for ${service}:`, res);
      toast.error(i18n.t("Authorization failed") + `: ${res.msg || 'Token encryption failed'}`, { id: "adding-sync-id" });
    }
    return res;
  } catch (error) {
    console.error(`Error during OAuth callback for ${service}:`, error);
    toast.error(i18n.t("Authorization failed") + `: ${error.message || 'Unknown error'}`, { id: "adding-sync-id" });
    return;
  }
};
export const encryptToken = async (service: string, config: any) => {
  let syncToken = JSON.stringify(config);
  let isAuthed = await TokenService.getToken("is_authed");
  if (!isAuthed) {
    await TokenService.setToken(service + "_token", syncToken);
    return { code: 200, msg: "success", data: syncToken };
  }
  let thirdpartyRequest = await getThirdpartyRequest();

  let response = await thirdpartyRequest.encryptToken({
    token: syncToken,
  });
  if (response.code === 200) {
    await TokenService.setToken(
      service + "_token",
      response.data.encrypted_token
    );
    return response;
  } else if (response.code === 401) {
    handleExitApp();
    return response;
  } else {
    toast.error(i18n.t("Encryption failed, error code") + ": " + response.msg);
    if (response.code === 20004) {
      toast(
        i18n.t("Please login again to update your membership on this device")
      );
    }
    return response;
  }
};
export const decryptToken = async (service: string) => {
  if (!service) {
    console.warn("decryptToken called with empty service");
    return { code: 400, msg: "Invalid service", data: null };
  }

  let isAuthed = await TokenService.getToken("is_authed");
  if (!isAuthed) {
    let syncToken = (await TokenService.getToken(service + "_token")) || "{}";
    return {
      code: 200,
      msg: "success",
      data: { token: syncToken },
    };
  }
  
  let thirdpartyRequest = await getThirdpartyRequest();
  let encryptedToken = await TokenService.getToken(service + "_token");
  
  if (!encryptedToken || encryptedToken === "{}") {
    console.warn(`No encrypted token found for service: ${service}`);
    return { code: 404, msg: "Token not found", data: null };
  }
  
  try {
    let response = await thirdpartyRequest.decryptToken({
      encrypted_token: encryptedToken,
    });
    
    if (response.code === 200) {
      return response;
    } else if (response.code === 401) {
      handleExitApp();
      return response;
    } else {
      console.warn(`Token decryption failed for ${service}:`, response);
      toast.error(i18n.t("Decryption failed, error code") + ": " + response.msg);
      if (response.code === 20004) {
        toast(
          i18n.t("Please login again to update your membership on this device")
        );
      }
      return response;
    }
  } catch (error) {
    console.error(`Error decrypting token for ${service}:`, error);
    return { code: 500, msg: "Decryption error", data: null };
  }
};
