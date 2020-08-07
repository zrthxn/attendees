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
const COOKIE_MAX_AGE = 86400000 // 24 Hours

export const authRouter = Router()

authRouter.get('/login', (req, res)=>{
  res.render('login')
})

authRouter.post('/login', async (req, res)=>{
  const { email } = req.body
  const { ruri } = req.query

  const token = await readToken(email)

  if(token) {
    let destination
    switch (ruri) {
      case 'create':
        destination = '/sheets/create'
        break
    
      default: 
        destination = `/sheets`
        break
    }

    /** @todo Set document cookie */
    res.cookie('userId', email, { httpOnly: true })
    res.cookie('access', 'hash', {
      maxAge: COOKIE_MAX_AGE, httpOnly: true, signed: true
    })

    return res.redirect(destination)
  }
  else {
    const credentials = await readCredentials()
    const { client_secret, client_id, redirect_uris } = credentials.web
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    res.cookie('userId', email, { httpOnly: true })
    res.redirect(
      oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
      })
    )
  }
})

authRouter.get('/callback', async (req, res)=>{
  const { code } = req.query
  const { userId } = req.cookies

  if(!userId) // Safegaurd
    return res.sendStatus(403)
  if(!code) // Safegaurd
    return res.sendStatus(403)

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
    res.cookie('access', 'hash', {
      maxAge: COOKIE_MAX_AGE, httpOnly: true, signed: true
    })
    
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