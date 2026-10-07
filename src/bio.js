import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { api } from "./api";
import { wrapForBiometric, unwrapWithBiometric } from "./lock";

// Register this phone's fingerprint / Face ID and wrap the data key with the server-held secret
export async function registerBiometric(dek) {
  const optionsJSON = await api.post("/api/webauthn/register/options");
  let response;
  try {
    response = await startRegistration({ optionsJSON });
  } catch (e) {
    throw new Error(e?.name === "NotAllowedError" ? "Fingerprint setup was cancelled." : `Fingerprint setup failed: ${e.message}`);
  }
  const { credentialId, secret } = await api.post("/api/webauthn/register/verify", { response });
  return { credentialId, wrapped: await wrapForBiometric(secret, dek) };
}

// Check the fingerprint; the server releases the secret only if the signature is valid
export async function unlockWithBiometric(bio) {
  const optionsJSON = await api.post("/api/webauthn/auth/options", { credentialId: bio.credentialId });
  let response;
  try {
    response = await startAuthentication({ optionsJSON });
  } catch (e) {
    throw new Error(e?.name === "NotAllowedError" ? "Fingerprint not recognised (or cancelled). Try again or use your passcode." : `Fingerprint check failed: ${e.message}`);
  }
  const { secret } = await api.post("/api/webauthn/auth/verify", { response });
  return unwrapWithBiometric(secret, bio.wrapped);
}

export async function removeBiometric(bio) {
  if (bio?.credentialId) await api.del(`/api/webauthn/${encodeURIComponent(bio.credentialId)}`).catch(() => {});
}
