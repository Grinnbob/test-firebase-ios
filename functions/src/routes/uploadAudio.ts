import { Router } from 'express'
import busboy from '../middleware/busboy'

const router = Router()
router.post('/', busboy, async (req, res) => {
  // … simple upload & save logic …
})

export default router
