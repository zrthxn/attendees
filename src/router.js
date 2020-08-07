import path from 'path'
import crypto from 'crypto'
import { google } from 'googleapis'
import { Router } from 'express'

import { readCredentials, readToken, readConfigFile } from './accounts'
import { firestore } from './database'
import { calendar } from 'googleapis/build/src/apis/calendar'

// --------------------------------------------------------
export const sheetRouter = Router()

sheetRouter.use((req, _, next) => {
  const { userId } = req.cookies
  const { access } = req.signedCookies

  /** @todo check document cookie */

  next()
})

// view sheet, and added lectures
sheetRouter.get('/', async (req, res)=>{
  const { userId } = req.cookies

  let userRecord = await firestore.collection('users').doc(userId).get()
  if (userRecord.exists) {
    let userSheets = await firestore.collection('sheets').where('belongsTo', '==', userId).get()
    
    return res.render('sheets', { 
      title: 'My Sheets', 
      sheets: userSheets.docs.map(doc => doc.data())
    })
  }
  else
    return res.status(403).render('status', { 
      status: 'Failed', message: 'This sheet does not exist.' 
    })
})

// Add lecture  
sheetRouter.post('/:sheetId/next', async (req, res)=>{
  const { userId } = req.cookies
  const { sheetId } = req.params

  let sheetRecord = await firestore.collection('sheets').doc(sheetId).get()
  if (sheetRecord.exists) {
    let { activeLecture } = sheetRecord.data()
    
    const credentials = await readCredentials()
    const token = await readToken(userId)

    if (!token) // Safegaurd
      return res.redirect('/auth/login?ruri=sheets')

    activeLecture++

    await firestore.collection('sheets').doc(sheetId).update({ activeLecture })

    const { client_secret, client_id, redirect_uris } = credentials.web
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
    auth.setCredentials(token)

    await google.sheets({ auth, version: 'v4' }).spreadsheets.values
      .update({
        spreadsheetId: ssId,
        range: columnToLetter(activeLecture + 2) + '1',
        valueInputOption: 'RAW',
        resource: {
          values: [
            [  `Lecture ${activeLecture} - ${(new Date()).toDateString()}` ]
          ]
        }
      })

    return res.redirect('/sheets')
  }
  else
    return res.status(403).render('status', { 
      status: 'Failed', message: 'This sheet does not exist.' 
    })
})

// Add lecture  
sheetRouter.post('/:sheetId/delete', async (req, res)=>{
  const { userId } = req.cookies
  const { sheetId } = req.params

  let sheetRecord = await firestore.collection('sheets').doc(sheetId).get()
  if (sheetRecord.exists) {    
    const token = await readToken(userId)
    if (!token) // Safegaurd
      return res.redirect('/auth/login?ruri=sheets')
    
    await firestore.collection('sheets').doc(sheetId).delete()

    return res.redirect('/sheets')
  }
  else
    return res.status(403).render('status', { 
      status: 'Failed', message: 'This sheet does not exist.' 
    })
})

sheetRouter.get('/create', (req, res)=>{
  const { userId } = req.cookies
  if (!userId) // Safegaurd
    res.redirect('/auth/login?ruri=create')

  res.render('create', { title: 'Create New Sheet' })
})

sheetRouter.post('/create', async (req, res)=>{
  const { userId } = req.cookies
  const { subject, studentCount, reqName, reqEmail } = req.body

  const credentials = await readCredentials()
  const token = await readToken(userId)

  if (!token) // Safegaurd
    res.redirect('/auth/login?ruri=create')

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

  try {
    // Create sheet
    const { client_secret, client_id, redirect_uris } = credentials.web
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
    auth.setCredentials(token)

    const GoogleSheets = google.sheets({ auth, version: 'v4' })

    let { data } = await GoogleSheets.spreadsheets
      .create({
        resource: {
          properties: {
            title: `${subject} - Attendance`
          }
        }
      })

    await GoogleSheets.spreadsheets.values
      .append({
        spreadsheetId: data.spreadsheetId,
        insertDataOption: 'INSERT_ROWS',
        valueInputOption: 'RAW',
        resource: {
          values: [
            [ "Roll Number", "Name" ]
          ]
        }
      })

    // Create record
    await firestore.collection('sheets').doc(sheetId)
      .set({
        ssId: data.spreadsheetId,
        belongsTo: userId,
        activeLecture: 0,
        sheetId,
        subject, 
        studentCount: parseInt(studentCount), 
        reqName, reqEmail,
        students: []
      })
  
    return res.redirect('/sheets') 
  } catch (error) {
    console.error(error)
    return res.status(500).render('status', { 
      status: 'Error', message: 'Internal server error.' 
    })
  }
})

// --------------------------------------------------------
export const markingRouter = Router()

// Mark in currently active lecture of sheet
markingRouter.get('/:sheetId', async (req, res)=>{
  const { sheetId } = req.params

  let sheetRecord = await firestore.collection('sheets').doc(sheetId).get()
  if (sheetRecord.exists) {
    let { subject, activeLecture, reqName, reqEmail } = sheetRecord.data()
    return res.render('mark', { 
      title: 'Mark your Attendance',
      class: subject, 
      lecture: activeLecture,
      reqName, reqEmail
    })
  }
  else
    return res.status(403).render('status', { 
      status: 'Failed', message: 'This sheet does not exist.' 
    })
})

// Submission route
markingRouter.post('/:sheetId', async (req, res)=>{
  const { sheetId } = req.params

  let { name, email, roll } = req.body
  if (!name) name = ""
  if (!email) email = ""

  let sheetRecord = await firestore.collection('sheets').doc(sheetId).get()
  if (sheetRecord.exists) {
    let { ssId, activeLecture, students, studentCount, belongsTo } = sheetRecord.data()

    if(activeLecture == 0)
      return res.status(403).render('status', { 
        status: 'Failed', message: 'No active lectures.' 
      })

    const credentials = await readCredentials()
    const token = await readToken(belongsTo)
  
    if (!token) // Safegaurd
      return res.status(500).render('status', { 
        status: 'Error', message: 'Internal server error.' 
      })
  
    if (!students.map(s => s.roll).includes(roll)) {
      if (students.length < studentCount)
        students.concat([ { roll, name, email } ])
      else
        return res.status(403).render('status', { 
          status: 'Failed', message: 'Class already full.' 
        })
    }

    await firestore.collection('sheets').doc(sheetId).update({ students })

    const { client_secret, client_id, redirect_uris } = credentials.web
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
    auth.setCredentials(token)

    const GoogleSheets = google.sheets({ auth, version: 'v4' })
    
    let { values } = await GoogleSheets.spreadsheets.values
      .get({
        spreadsheetId: ssId,
        range: `A2:A${students.length}`,
        majorDimension: 'COLUMNS'
      })
    
    values = values[0]  

    if (!values.includes(roll)) {
      await GoogleSheets.spreadsheets.values
        .append({
          spreadsheetId: ssId,
          range: `A2:A${students.length}`,
          insertDataOption: 'INSERT_ROWS',
          valueInputOption: 'RAW',
          resource: {
            values: [
              [ roll, `${name} <${email}>` ]
            ]
          }
        })
    }

    let cellIndex = columnToLetter(activeLecture + 2)
    let row = values.indexOf(roll)

    if (row !== -1)
      cellIndex += values.indexOf(roll).toString()
    else
      cellIndex += (students.length + 1).toString()
      

    /** @todo Add P to right row */
    await GoogleSheets.spreadsheets.values
      .update({
        spreadsheetId: ssId,
        range: cellIndex,
        valueInputOption: 'RAW',
        resource: {
          values: [
            [ 'P' ]
          ]
        }
      })

    return res.render('status', {
      status: 'Success', 
      message: 'Your attendance was marked.' 
    })
  }
  else
    return res.status(403).render('status', { 
      status: 'Failed', message: 'This sheet does not exist.' 
    })
})

function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function letterToColumn(letter) {
  let column = 0, length = letter.length;
  for (let i = 0; i < length; i++) {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  return column;
}