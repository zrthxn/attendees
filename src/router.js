import crypto from 'crypto'
import { google } from 'googleapis'
import { Router } from 'express'

import { readCredentials, readToken } from './accounts'
import { firestore } from './database'

// --------------------------------------------------------
export const sheetRouter = Router()

sheetRouter.use(async (req, res, next) => {
  const { userId } = req.cookies
  const { access } = req.signedCookies

  /** @todo check document cookie */
  if (!userId)
    return res.redirect('/auth/login?then=sheets')

  const token = await readToken(userId)
  if (!token) // Safegaurd
    return res.redirect('/auth/login?then=sheets')

  if (access === crypto.createHash('sha512')
      .update(process.env.AUTH_KEY)
      .update(token.access_token)
      .digest('hex')
    ) 
    next()
  else
    return res.redirect('/auth/login?then=sheets')
})

// view sheet, and added lectures
sheetRouter.get('/', async (req, res)=>{
  const { userId } = req.cookies

  if (!userId) // Safegaurd
    return res.redirect('/auth/login?then=sheets')

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
      status: 'Failed', title: 'Failed', message: 'This sheet does not exist.' 
    })
})

// Add lecture  
sheetRouter.post('/:sheetId/next', async (req, res)=>{
  const { userId } = req.cookies
  const { sheetId } = req.params

  let sheetRecord = await firestore.collection('sheets').doc(sheetId).get()
  if (sheetRecord.exists) {
    let { ssId, activeLecture } = sheetRecord.data()
    
    const credentials = await readCredentials()
    const token = await readToken(userId)

    if (!token) // Safegaurd
      return res.redirect('/auth/login?then=sheets')

    activeLecture++

    await firestore.collection('sheets').doc(sheetId)
      .update({ 
        activeLecture,
        isActiveLecture: true
      })

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

// Close Lecture
sheetRouter.post('/:sheetId/stop', async (req, res)=>{
  const { sheetId } = req.params

  let sheetRecord = await firestore.collection('sheets').doc(sheetId).get()
  if (sheetRecord.exists) {
    await firestore.collection('sheets').doc(sheetId).update({
      isActiveLecture: false
    })

    return res.redirect('/sheets')
  }
  else
    return res.status(403).render('status', { 
      status: 'Failed', title: 'Failed', message: 'This sheet does not exist.' 
    })
})

// Reopen Lecture
sheetRouter.post('/:sheetId/reopen', async (req, res)=>{
  const { sheetId } = req.params

  let sheetRecord = await firestore.collection('sheets').doc(sheetId).get()
  if (sheetRecord.exists) {
    await firestore.collection('sheets').doc(sheetId).update({
      isActiveLecture: true
    })

    return res.redirect('/sheets')
  }
  else
    return res.status(403).render('status', { 
      status: 'Failed', title: 'Failed', message: 'This sheet does not exist.' 
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
      return res.redirect('/auth/login?then=sheets')
    
    await firestore.collection('sheets').doc(sheetId).delete()

    return res.redirect('/sheets')
  }
  else
    return res.status(403).render('status', { 
      status: 'Failed', title: 'Failed', message: 'This sheet does not exist.' 
    })
})

sheetRouter.get('/create', (req, res)=>{
  const { userId } = req.cookies
  if (!userId) // Safegaurd
    res.redirect('/auth/login?then=create')

  res.render('create', { title: 'Create New Sheet' })
})

sheetRouter.post('/create', async (req, res)=>{
  const { userId } = req.cookies
  
  let { subject, studentCount, reqName, reqEmail } = req.body
  reqName = (reqName) ? true : false
  reqEmail = (reqEmail) ? true : false
  
  const credentials = await readCredentials()
  const token = await readToken(userId)

  if (!token) // Safegaurd
    res.redirect('/auth/login?then=create')

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
    res.redirect('/auth/login?then=create')

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
        range: 'A1:B1',
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
        isActiveLecture: false,
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
    if (sheetRecord.data().isActiveLecture)
      try {
        if(req.signedCookies.roll && req.signedCookies.verify)
          if(req.signedCookies.verify === crypto.createHash('sha256')
              .update(req.signedCookies.roll)
              .update(sheetId)
              .update(sheetRecord.data().activeLecture.toString())
              .digest('base64'))
            throw 'Already Marked'
          
        return res.render('mark', { 
          title: 'Mark your Attendance',
          data: sheetRecord.data()
        })
      } catch (error) {
        return res.status(403).render('status', { 
          status: 'Denied', title: 'Denied', message: 'You\'ve already marked your attendance.' 
        })
      }
    else
      return res.status(403).render('status', { 
        status: 'Denied', message: 'Attendance is closed.' 
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
    let { ssId, activeLecture, isActiveLecture, students, studentCount, belongsTo } = sheetRecord.data()

    if(activeLecture == 0)
      return res.status(403).render('status', { 
        status: 'Failed', message: 'No active lectures.' 
      })

    if (!isActiveLecture)
      return res.status(403).render('status', { 
        status: 'Denied', message: 'Attendance is closed.' 
      })

    const credentials = await readCredentials()
    const token = await readToken(belongsTo)
  
    if (!token) // Safegaurd
      return res.status(500).render('status', { 
        status: 'Error', message: 'Internal server error.' 
      })
  
    if (!students.map(({roll}) => roll).includes(roll)) {
      if (students.length < studentCount)
        students = students.concat([ { roll, name, email } ])
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
    
    let { data } = await GoogleSheets.spreadsheets.values
      .get({
        spreadsheetId: ssId,
        range: `A2:A${students.length + 1}`,
        majorDimension: 'COLUMNS'
      })
    
    let values = (data.values !== undefined) ? data.values[0] : []

    if (!values.includes(roll)) {
      await GoogleSheets.spreadsheets.values
        .append({
          spreadsheetId: ssId,
          range: `A2:A${values.length + 1}`,
          insertDataOption: 'INSERT_ROWS',
          valueInputOption: 'RAW',
          resource: {
            majorDimension: 'ROWS',
            values: [
              [ roll, `${name} ${email}` ]
            ]
          }
        })
    }

    let cellIndex = columnToLetter(activeLecture + 2)
    let row = values.indexOf(roll)

    cellIndex += (row !== -1) ? (row + 2).toString() : (students.length + 1).toString()
      
    // Add P to right row
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

    const verify = crypto.createHash('sha256')
      .update(roll)
      .update(sheetId)
      .update(activeLecture.toString())
      .digest('base64')

    res.cookie('roll', roll, { httpOnly: true, signed: true })
    res.cookie('verify', verify, { maxAge: 86400000, httpOnly: true, signed: true })
    return res.render('status', {
      status: 'Success', title: 'Success', message: 'Your attendance was marked.'
    })
  }
  else
    return res.status(403).render('status', { 
      status: 'Failed', title: 'Failed', message: 'This sheet does not exist.' 
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