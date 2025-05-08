import { bucket } from '../config/firebase'

export async function uploadToFirebaseStorage(
  filePath: string,
  fileName: string,
  contentType: string
): Promise<string> {
  await bucket.upload(filePath, {
    destination: `audio/${fileName}`,
    metadata: { contentType }
  })
  return `https://storage.googleapis.com/${bucket.name}/audio/${fileName}`
}
