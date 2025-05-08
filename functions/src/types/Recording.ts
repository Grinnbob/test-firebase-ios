import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export interface RecordingDocument {
  filename: string
  path: string
  storageUrl?: string
  size: number
  uploadedAt: Timestamp | FieldValue | { seconds: number; nanoseconds: number }
  transcript?: string
  recommendations?: string
  userId?: string | null
  metadata?: Record<string, any>
}
