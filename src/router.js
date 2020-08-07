import path from 'path'
import crypto from 'crypto'
import google from 'googleapis'
import { Router } from 'express'

import { firestore } from './database'

// --------------------------------------------------------
export const sheetRouter = Router()

sheetRouter.use((req, _, next) => {
  const { userId } = req.cookies
  const { access } = req.signedCookies

  /** @todo check document cookie */

  next()
})

sheetRouter.get('/', async (req, res)=>{
  // view sheet, and added lectures
  const { userId } = req.cookies

  let userRecord = await firestore.collection('users').doc(userId).get()
  if (userRecord.exists) {
    let userSheets = await firestore.collection('sheets').where('belongsTo', '==', userId).get()
    return res.render('sheets', { title: 'My Sheets', sheets: userSheets.docs })
  }
  else
    return res.status(403).send('This sheet does not exist.')
})

sheetRouter.post('/:sheetId/next', async (req, res)=>{
  // Add lecture  
  const { userId } = req.cookies
  const { sheetId } = req.params

  let sheetRecord = await firestore.collection('sheets').doc(sheetId).get()
  if (sheetRecord.exists) {
    let { title, activeLecture } = sheetRecord.data()
    
    const credentials = await readCredentials()
    const token = await readToken(userId)

    if (!token) // Safegaurd
      return res.redirect('/auth/login?ruri=sheets')

    const { client_secret, client_id, redirect_uris } = credentials.web
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
    auth.setCredentials(token)

    google.sheets_v4({ auth }).spreadsheets.append()

    return res.redirect('/sheets')
  }
  else
    return res.status(403).send('This sheet does not exist.')
})

sheetRouter.get('/create', (_, res)=>{
  res.render('create', { title: 'Create New Sheet' })
})

sheetRouter.post('/create', async (req, res)=>{
  const { userId } = req.cookies
  const { subject, nStudents } = req.body

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
      sheets: userRecord.data().sheets.concat([sheetId])
    })
  else // Safegaurd
    res.redirect('/auth/login?ruri=create')

  // Create sheet
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
    // Create record
    await firestore.collection('sheets').doc(sheetId).set({
      subject,
      ssId: spreadsheet.spreadsheetId,
      belongsTo: userId,
      activeLecture: 0,
      number: nStudents
    })

    res.redirect('/sheets')
  });
})

// --------------------------------------------------------
export const markingRouter = Router()

markingRouter.get('/:sheetId', async (req, res)=>{
  // Mark in currently active lecture of sheet
  const { sheetId } = req.params

  let sheetRecord = await firestore.collection('sheets').doc(sheetId).get()
  if (sheetRecord.exists) {
    let { subject, activeLecture } = sheetRecord.data()
    return res.render('mark', { 
      class: subject, 
      lecture: activeLecture 
    })
  }
  else
    return res.status(403).send('This sheet does not exist.')
})

markingRouter.post('/', async (req, res)=>{
  // Submission route
  const { sheetId, lecture, email, roll } = req.body

  let sheetRecord = await firestore.collection('sheets').doc(sheetId).get()
  if (sheetRecord.exists) {
    let { ssId, activeLecture, belongsTo } = sheetRecord.data()

    if(lecture !== activeLecture)
      return res.status(403).send('Cannot mark attendance for a previous lecture.')

    const credentials = await readCredentials()
    const token = await readToken(belongsTo)
  
    if (!token) // Safegaurd
      return res.sendStatus(500)
  
    const { client_secret, client_id, redirect_uris } = credentials.web
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
    auth.setCredentials(token)

    /** @todo Add P to right row */
    google.sheets_v4({ auth }).spreadsheets.append()

    return res.render('success', {
      message: 'Your attendance was marked.' 
    })
  }
  else
    return res.status(403).send('This sheet does not exist')
})