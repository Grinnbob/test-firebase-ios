import Busboy from 'busboy'
import { Request, Response, NextFunction } from 'express'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { FileData } from '../types/FileData'

export default function busboyMiddleware(req: Request, res: Response, next: NextFunction) {
  const bb = Busboy({ headers: req.headers })
  let fileData: FileData | null = null

  bb.on('file', (field, stream, info) => {
    // … your chunk or file parsing logic …
  })

  bb.on('field', (name, val) => {
    // … parse metadata fields …
  })

  bb.on('close', () => {
    ;(req as any).fileData = fileData
    next()
  })

  req.pipe(bb)
}
