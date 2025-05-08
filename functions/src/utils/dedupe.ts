import crypto from 'crypto'
import { Request } from 'express'
import { FileData } from '../types/FileData'

export const requestDeduplicationMap = new Map<
  string,
  { timestamp: number; recordingId: string }
>()

export function generateRequestSignature(
  req: Request,
  fileData?: FileData
): string {
  const requestId = req.headers['x-request-id'] || req.query.requestId
  const clientId = req.headers['x-client-id'] || req.query.clientId
  if (requestId && clientId) {
    return crypto
      .createHash('md5')
      .update(`${clientId}-${requestId}`)
      .digest('hex')
  }
  const userId = (req as any).user?.uid || 'anonymous'
  const fileSize = fileData?.size || 0
  const components = [
    userId,
    fileSize.toString(),
    `${clientId || ''}`,
    `${requestId || ''}`
  ]
  const timeWindow = Math.floor(Date.now() / 5000) * 5
  components.push(timeWindow.toString())
  return crypto.createHash('md5').update(components.join('-')).digest('hex')
}
