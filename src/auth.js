/**
 * @description
 * Handle authentication with GMail scopes with OAuth2 and store token files.
 */

import fs from 'fs'
import path from 'path'
import { Router } from 'express'
import { google } from 'googleapis'

import { readCredentials, readToken, readConfigFile } from './accounts'
import { firestore } from './database'
import { AUTHDIR } from '.'

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

const auth = Router()

auth.get('/login', (req, res)=>{
  res.render('login')
})

auth.post('/login', async (req, res)=>{
  const { email } = req.body
  const { ruri } = req.query

  const token = await readToken(email)

  if(token) {
    let destination
    switch (ruri) {
      case 'create':
        destination = '/create'
        break
    
      default: 
        destination = `/sheets/${email}`
        break
    }

    /** @todo Set document cookie */
    return res.redirect(destination)
  }
  else {
    const credentials = await readCredentials()
    const { client_secret, client_id, redirect_uris } = credentials.web
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    res.redirect(
      oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
      })
    )
  }
})

auth.post('/auth/callback', async (req, res)=>{
  const { code } = req.query

  const credentials = await readCredentials()
  const { client_secret, client_id, redirect_uris } = credentials.web
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

  try {
    let token = await oAuth2Client.getToken(code)  
    oAuth2Client.setCredentials(token)

    let config = await readConfigFile()
    config.accounts[userId] = token
    
    fs.writeFileSync(path.join(AUTHDIR, 'auth.config.json'), JSON.stringify(config, null, 2))

    console.log('Token stored to', config.accounts[userId].token)
    
    /** @todo Set document cookie */
    
    await firestore.collection('users').doc(userId).set({
      userId,
      sheets: []
    })

    return res.redirect(`/sheets/${userId}`)
  } catch (error) {
    console.error(error)
    return res.sendStatus(500)
  }
})

export default auth