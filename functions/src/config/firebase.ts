import admin from 'firebase-admin'

const adminConfig = process.env.FUNCTIONS_EMULATOR
  ? {
      projectId: 'demo-docnote-e7f1e',
      firestore: { host: 'localhost', port: 9080 },
      storageBucket: 'demo-docnote-e7f1e.firebasestorage.app'
    }
  : { storageBucket: 'demo-docnote-e7f1e.firebasestorage.app' }

admin.initializeApp(adminConfig)

export const db = admin.firestore()
export const recordingsCollection = db.collection('recordings')
export const bucket = admin.storage().bucket()
