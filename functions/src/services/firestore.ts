import { recordingsCollection, db } from '../config/firebase'
import { RecordingDocument } from '../types/Recording'

export async function saveRecordingToFirestore(data: RecordingDocument): Promise<string> {
  const docRef = await recordingsCollection.add(data)
  return docRef.id
}

export async function deleteAllRecordings(userId?: string): Promise<number> {
  const snapshot = userId
    ? await recordingsCollection.where('userId', '==', userId).get()
    : await recordingsCollection.get()
  const batch = db.batch()
  snapshot.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
  return snapshot.size
}

export async function deleteRecordingById(id: string): Promise<void> {
  await recordingsCollection.doc(id).delete()
}
