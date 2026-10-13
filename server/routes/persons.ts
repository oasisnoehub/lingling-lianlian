import { Router } from 'express'
import { getAllPersons, getPersonById } from '../db.js'

const router = Router()

router.get('/', (_req, res) => {
  try {
    const persons = getAllPersons()
    res.json(persons)
  } catch (err) {
    console.error('Error getting persons:', err)
    res.status(500).json({ error: 'Failed to get persons' })
  }
})

router.get('/:id', (req, res) => {
  try {
    const person = getPersonById(req.params.id)
    if (!person) {
      return res.status(404).json({ error: 'Person not found' })
    }
    res.json(person)
  } catch (err) {
    console.error('Error getting person:', err)
    res.status(500).json({ error: 'Failed to get person' })
  }
})

export default router
