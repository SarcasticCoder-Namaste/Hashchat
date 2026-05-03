import { requestUploadUrl } from "@workspace/api-client-react";

export async function uploadFile(
  uri: string,
  name: string,
  contentType: string,
): Promise<string> {
  const fileResp = await fetch(uri);
  const blob = await fileResp.blob();
  const size = blob.size;

  const presigned = await requestUploadUrl({
    name,
    size,
    contentType,
  });

  const put = await fetch(presigned.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!put.ok) {
    throw new Error(`upload failed: ${put.status}`);
  }
  return presigned.objectPath;
}
