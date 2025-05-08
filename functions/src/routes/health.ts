import { Router } from 'express'
const router = Router()
router.get('/', (req, res) => res.status(200).send('Audio upload service is running'))
export default router
