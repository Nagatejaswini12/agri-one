import { supabase } from "@/lib/supabaseClient";

const CROP_SCANS_BUCKET = "crop-scans";
/** Long enough for the n8n agent to fetch the image once; not a durable link. */
const SIGNED_URL_TTL_SECONDS = 120;

/**
 * Uploads a crop-scan photo to the farmer's own private path and returns
 * both the durable storage path (persisted on the Scan row) and a
 * short-lived signed URL (sent to n8n so the agent can fetch the bytes
 * without holding a Storage credential itself). Storage RLS restricts
 * every path to its own farmer, so the path prefix must be the farmer's
 * auth uid — see supabase/migrations/20260919140000_phase2_scans.sql.
 */
export async function uploadCropScanImage(
  farmerId: string,
  farmId: string,
  file: File
): Promise<{ storagePath: string; signedUrl: string }> {
  if (!supabase) throw new Error("Not signed in.");

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storagePath = `${farmerId}/${farmId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(CROP_SCANS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || "image/jpeg" });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(CROP_SCANS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signError || !data) throw signError ?? new Error("Could not create a signed URL for the upload.");

  return { storagePath, signedUrl: data.signedUrl };
}
