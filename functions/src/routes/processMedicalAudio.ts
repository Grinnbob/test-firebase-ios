import { Router } from 'express'
import busboy from '../middleware/busboy'
import { generateRequestSignature, requestDeduplicationMap } from '../utils/dedupe'
import { transcribeAudio, getMedicalRecommendations } from '../services/audio'
import { uploadToFirebaseStorage } from '../services/storage'
import { saveRecordingToFirestore } from '../services/firestore'

const router = Router()
router.post('/', busboy, async (req, res) => {
  // … your combined upload → transcribe → AI → save logic …
})

export default router
