import express from 'express'
import cors from 'cors'
import * as functions from 'firebase-functions'

// Routers
import healthRouter from './routes/health'
import recordingsAllRouter from './routes/recordingsAll'
import recordingsByIdRouter from './routes/recordingsById'
import recordingsListRouter from './routes/recordingsList'
import processMedicalAudioRouter from './routes/processMedicalAudio'
import uploadAudioRouter from './routes/uploadAudio'
import uploadAudioChunkRouter from './routes/uploadAudioChunk'
import finalizeChunkRouter from './routes/finalizeChunk'

// Error handler
import errorHandler from './middleware/errorHandler'

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

// Mount routes in correct order
app.use('/test', healthRouter)
app.use('/recordings/all', recordingsAllRouter)
app.use('/recordings/:id', recordingsByIdRouter)
app.use('/recordings', recordingsListRouter)
app.use('/process-medical-audio', processMedicalAudioRouter)
app.use('/upload-audio', uploadAudioRouter)
app.use('/upload-audio-chunk', uploadAudioChunkRouter)
app.use('/finalize-chunked-upload', finalizeChunkRouter)

// Error handling middleware
app.use(errorHandler)

export const api = functions
  .runWith({ memory: '1GB', timeoutSeconds: 300 })
  .https.onRequest(app)
