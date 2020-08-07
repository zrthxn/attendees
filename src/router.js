import path from 'path'
import crypto from 'crypto'
import google from 'googleapis'
import { Router } from 'express'

import { firestore } from './database'

const router = Router()

router.get('/', (req, res)=>{
  res.render('home')
})

router.get('/github', (req, res)=>{
  res.redirect('https://github.com/zrthxn')
})

// --------------------------------------------------------
router.get('/create', (req, res)=>{
  /** @todo check document cookie */
  res.render('create')
})

router.post('/create', async (req, res)=>{
  const { userId, subject, nStudents } = req.body

  const credentials = await readCredentials()
  const token = await readToken(userId)

  if (!token) // Safegaurd
    res.redirect('/auth/login?ruri=create')

  const { client_secret, client_id, redirect_uris } = credentials.web
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
  auth.setCredentials(token)

  let sheetId = String()
  for (let t = 0; t < 5; t++) { // Prevent sheetId collision
    sheetId = crypto.randomBytes(5).toString('hex')
    let sheet = await firestore.collection('sheets').doc(sheetId).get()
    if(!sheet.exists)
      break
  }

  let userRecord = await firestore.collection('users').doc(userId).get()
  if (userRecord.exists) // Add sheetId to user
    await firestore.collection('users').doc(userId).update({
      sheets: userRecord.data().sheets.concat(sheetId)
    })
  else // Safegaurd
    res.redirect('/auth/login?ruri=create')

  google.sheets_v4({ auth }).spreadsheets.create({
    fields: 'spreadsheetId',
    resource: {
      properties: {
        title: `${subject} - Attendance`
      }
    }
  }, async (err, spreadsheet) =>{
    if (err) {
      console.error(err)
      return res.sendStatus(500)
    }

    await firestore.collection('sheets').doc(sheetId).set({
      ssId: spreadsheet.spreadsheetId,
      activeLecture: 0
    })

    res.redirect(`/sheets/${userId}`)
  });
})

// --------------------------------------------------------
router.get('/mark/:sheetId', async (req, res)=>{
  // Mark in currently active lecture of sheet
  const { sheetId } = req.params
  res.render('mark', { 
    'class': 'Power System', 
    'lecture': '3' 
  })
})

router.post('/mark', async (req, res)=>{
  // Submission route
  const { sheetId, lecture, email, roll } = req.body
  res.render('success', {
    'message': 'Your attendance was marked.' 
  })
})

// --------------------------------------------------------
router.get('/sheets/:username', async (req, res)=>{
  // view sheet, and added lectures
  /** @todo check document cookie */
  res.render('sheets')
})

router.post('/sheets/:sheetId/next', async (req, res)=>{
  // Add lecture
  /** @todo check document cookie */
  const credentials = await readCredentials()
  const token = await readToken(userId)

  if (!token) // Safegaurd
    res.redirect('/auth/login?ruri=sheets')

  const { client_secret, client_id, redirect_uris } = credentials.web
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
  auth.setCredentials(token)

  google.sheets_v4({ auth }).spreadsheets.append()

  res.render('sheets')
})

export default router