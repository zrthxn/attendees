import path from 'path'
import google from 'googleapis'
import { Router } from 'express'

const router = Router()

router.get('/', (req, res)=>{
  res.render('home')
})

router.get('/github', (req, res)=>{
  res.redirect('https://github.com/zrthxn')
})

// --------------------------------------------------------
router.get('/create', (req, res)=>{
  res.render('create')
})

router.post('/create', async (req, res)=>{
  const { userId, subject, nStudents } = req.body

  const credentials = await readCredentials()
  const token = await readToken(userId)

  if(!token) // Safegaurd
    res.redirect('/auth/login?ruri=create')

  const { client_secret, client_id, redirect_uris } = credentials.web
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
  auth.setCredentials(token)

  google.sheets_v4({ auth }).spreadsheets.create({
    fields: 'spreadsheetId',
    resource: {
      properties: {
        title: `${subject} - Attendance`
      }
    }
  }, (err, spreadsheet) =>{
    if (err) {
      console.log(err);
    } else {
      console.log(`Spreadsheet ID: ${spreadsheet.spreadsheetId}`);
    }
  });

  res.render('create')
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

  if(!token) // Safegaurd
    res.redirect('/auth/login?ruri=sheets')

  const { client_secret, client_id, redirect_uris } = credentials.web
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
  auth.setCredentials(token)

  google.sheets_v4({ auth }).spreadsheets.append()

  res.render('sheets')
})

export default router