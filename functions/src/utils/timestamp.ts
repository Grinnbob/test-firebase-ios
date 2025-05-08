import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export function createFirestoreTimestamp():
  | FieldValue
  | { seconds: number; nanoseconds: number } {
  try {
    return FieldValue.serverTimestamp()
  } catch {}
  try {
    return Timestamp.now()
  } catch {}
  const now = new Date()
  return { seconds: Math.floor(now.getTime() / 1000), nanoseconds: now.getMilliseconds() * 1e6 }
}
